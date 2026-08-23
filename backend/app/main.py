from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, text
from dotenv import load_dotenv
import os, io, math, csv, statistics, secrets, hashlib, hmac
from pathlib import Path
import pandas as pd
from datetime import date, datetime, timedelta, timezone
from .database import Base, engine, get_db
from .models import User, Transaction, Budget, Goal, Investment, Asset, Liability, Insight
from .schemas import *
from .auth import *
from .utils import categorize, merchant_from, detect_subscription, detect_anomalies
from .account_services import (
    utcnow, hash_otp, make_otp, send_email, google_configured, google_authorize_url,
    google_exchange_code, twilio_configured, twilio_start_sms, twilio_check_sms
)
import httpx

# Reuse one HTTP client so each chat does not pay connection/TLS setup again.
_NVIDIA_HTTP = httpx.Client(
    timeout=httpx.Timeout(60.0, connect=3.0, read=50.0, write=10.0, pool=5.0),
    limits=httpx.Limits(max_connections=12, max_keepalive_connections=6, keepalive_expiry=30.0),
    headers={'Accept': 'application/json'},
)

load_dotenv()
Base.metadata.create_all(bind=engine)

# Backward-compatible schema upgrade for existing FinSight databases.
def ensure_profile_columns():
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation VARCHAR(120)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(160)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_code VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_code VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_expires TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ",
    ]
    try:
        with engine.begin() as conn:
            for statement in statements:
                conn.execute(text(statement))
    except Exception as exc:
        print(f'Profile schema upgrade warning: {exc}')

ensure_profile_columns()
app=FastAPI(title='FinSight API', version='1.0.0')
FRONTEND_URL=os.getenv('FRONTEND_URL','http://localhost:5173')
origins=[o.strip().rstrip('/') for o in os.getenv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(',') if o.strip()]
# Allow both common local frontend hostnames during development. Production deployments should set CORS_ORIGINS explicitly.
for local_origin in ('http://localhost:5173','http://127.0.0.1:5173'):
    if local_origin not in origins:
        origins.append(local_origin)
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
AVATAR_DIR=Path(__file__).resolve().parents[1]/'uploads'/'avatars'
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
app.mount('/media', StaticFiles(directory=str(AVATAR_DIR.parent)), name='media')

@app.get('/api/health')
def health(): return {'status':'ok','database':'postgresql'}

@app.post('/api/auth/register', response_model=TokenOut)
def register(x:RegisterIn, db:Session=Depends(get_db)):
    email=str(x.email).strip().lower()
    if db.query(User).filter(User.email==email).first():
        raise HTTPException(400,'Email already registered. Use Sign in instead.')
    u=User(name=x.name.strip(), email=email, password_hash=hash_password(x.password), email_verified=False)
    db.add(u); db.commit(); db.refresh(u)
    return {'access_token':create_token(u.id),'user':user_payload(u)}

@app.post('/api/auth/login', response_model=TokenOut)
def login(x:LoginIn, db:Session=Depends(get_db)):
    email=str(x.email).strip().lower()
    u=db.query(User).filter(User.email==email).first()
    if not u or not verify_password(x.password,u.password_hash):
        raise HTTPException(401,'Invalid email or password')
    return {'access_token':create_token(u.id),'user':user_payload(u)}

@app.get('/api/auth/google/status')
def google_status():
    return {'configured': google_configured()}

@app.get('/api/auth/google/start')
def google_start():
    if not google_configured():
        raise HTTPException(503,'Google login is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to backend/.env.')
    state=jwt.encode({'nonce':secrets.token_urlsafe(24),'exp':int((utcnow()+timedelta(minutes=10)).timestamp())}, SECRET_KEY, algorithm=ALGORITHM)
    return RedirectResponse(google_authorize_url(state))

@app.get('/api/auth/google/callback')
def google_callback(code:str='', state:str='', db:Session=Depends(get_db)):
    try:
        jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(400,'Invalid or expired Google login state. Please try again.')
    try:
        info=google_exchange_code(code)
    except Exception as exc:
        raise HTTPException(400,f'Google sign-in failed: {exc}')
    email=str(info.get('email','')).strip().lower()
    if not email or info.get('email_verified') is not True:
        raise HTTPException(400,'Google did not return a verified email address.')
    name=(info.get('name') or info.get('given_name') or email.split('@')[0]).strip()
    avatar=info.get('picture') or ''
    u=db.query(User).filter(User.email==email).first()
    if not u:
        u=User(name=name,email=email,password_hash=hash_password(secrets.token_urlsafe(32)),email_verified=True,avatar_url=avatar or None)
        db.add(u)
    else:
        u.email_verified=True
        if avatar and not u.avatar_url: u.avatar_url=avatar
        if not u.name: u.name=name
    db.commit(); db.refresh(u)
    token=create_token(u.id)
    redirect=f"{FRONTEND_URL.rstrip('/')}/#/oauth/callback?token={token}"
    return RedirectResponse(redirect, status_code=302)

@app.post('/api/auth/forgot-password')
def forgot_password(x:ForgotPasswordIn, db:Session=Depends(get_db)):
    email=str(x.email).strip().lower()
    u=db.query(User).filter(User.email==email).first()
    response={'message':'If an account exists for that email, a verification code has been sent.'}
    if not u:
        return response
    code=make_otp(); u.password_reset_code=hash_otp(code); u.password_reset_expires=utcnow()+timedelta(minutes=10); db.commit()
    try:
        send_email(
            'FinSight password reset code', email,
            f'Your FinSight password reset code is {code}. It expires in 10 minutes. If you did not request this, ignore this email.',
            f'<p>Your FinSight password reset code is <strong>{code}</strong>.</p><p>It expires in 10 minutes.</p><p>If you did not request this, you can ignore this email.</p>'
        )
    except Exception as exc:
        u.password_reset_code=None; u.password_reset_expires=None; db.commit()
        raise HTTPException(503,str(exc))
    return response

@app.post('/api/auth/reset-password')
def reset_password(x:ResetPasswordIn, db:Session=Depends(get_db)):
    email=str(x.email).strip().lower()
    u=db.query(User).filter(User.email==email).first()
    if not u: raise HTTPException(400,'Invalid or expired reset request.')
    expires=u.password_reset_expires
    if expires and expires.tzinfo is None: expires=expires.replace(tzinfo=timezone.utc)
    if not u.password_reset_code or not expires or expires < utcnow() or not hmac.compare_digest(u.password_reset_code, hash_otp(x.code)):
        raise HTTPException(400,'Invalid or expired reset code.')
    u.password_hash=hash_password(x.new_password); u.password_reset_code=None; u.password_reset_expires=None; db.commit()
    return {'message':'Password reset successfully. You can sign in now.'}

def user_payload(u: User):
    return {
        'id':u.id, 'name':u.name, 'email':u.email,
        'phone':u.phone or '', 'phone_verified':bool(u.phone_verified),
        'email_verified':bool(u.email_verified), 'avatar_url':u.avatar_url or '',
        'date_of_birth':u.date_of_birth.isoformat() if u.date_of_birth else '',
        'occupation':u.occupation or '', 'location':u.location or '',
        'created_at':u.created_at.isoformat() if u.created_at else ''
    }

@app.get('/api/me')
def me(u:User=Depends(current_user)): return user_payload(u)

@app.put('/api/profile')
def update_profile(x:ProfileUpdateIn, u:User=Depends(current_user), db:Session=Depends(get_db)):
    previous_phone=u.phone
    raw_phone=(x.phone or '').strip()
    next_phone=raw_phone or None
    if next_phone:
        next_phone='+' + ''.join(ch for ch in next_phone[1:] if ch.isdigit()) if next_phone.startswith('+') else ''.join(ch for ch in next_phone if ch.isdigit())
        if not next_phone.startswith('+'): next_phone='+' + next_phone
        if not (8 <= len(next_phone)-1 <= 15): raise HTTPException(400,'Use a valid international phone number in E.164 format, for example +919876543210.')
    u.name=x.name.strip()
    u.phone=next_phone
    u.date_of_birth=x.date_of_birth
    u.occupation=(x.occupation or '').strip() or None
    u.location=(x.location or '').strip() or None
    # Changing the phone number requires verification again.
    if next_phone != previous_phone:
        u.phone_verified=False
        u.phone_verification_code=None
        u.phone_verification_expires=None
    db.commit(); db.refresh(u)
    return user_payload(u)

@app.post('/api/profile/avatar')
async def upload_avatar(file:UploadFile=File(...), u:User=Depends(current_user), db:Session=Depends(get_db)):
    content_type=(file.content_type or '').lower()
    allowed={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}
    if content_type not in allowed:
        raise HTTPException(400,'Please upload a JPG, PNG, or WEBP image.')
    raw=await file.read()
    if len(raw)>4*1024*1024:
        raise HTTPException(400,'Profile image must be 4 MB or smaller.')
    suffix=allowed[content_type]
    path=AVATAR_DIR/f'user_{u.id}{suffix}'
    # Remove previous avatar formats.
    for old in AVATAR_DIR.glob(f'user_{u.id}.*'):
        try: old.unlink()
        except OSError: pass
    path.write_bytes(raw)
    u.avatar_url=f'/media/avatars/{path.name}'
    db.commit(); db.refresh(u)
    return {'avatar_url':u.avatar_url,'user':user_payload(u)}

@app.delete('/api/profile/avatar')
def delete_avatar(u:User=Depends(current_user), db:Session=Depends(get_db)):
    for old in AVATAR_DIR.glob(f'user_{u.id}.*'):
        try: old.unlink()
        except OSError: pass
    if u.avatar_url and u.avatar_url.startswith('/media/avatars/'):
        u.avatar_url=None
    db.commit(); db.refresh(u)
    return {'message':'Profile photo removed.','user':user_payload(u)}

def _normalize_expiry(value):
    if value is None: return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

def _email_verification_code(u:User, db:Session):
    code=make_otp(); u.email_verification_code=hash_otp(code); u.email_verification_expires=utcnow()+timedelta(minutes=10); db.commit()
    try:
        send_email(
            'Verify your FinSight email', u.email,
            f'Your FinSight email verification code is {code}. It expires in 10 minutes.',
            f'<p>Your FinSight email verification code is <strong>{code}</strong>.</p><p>This code expires in 10 minutes.</p>'
        )
    except Exception:
        u.email_verification_code=None; u.email_verification_expires=None; db.commit(); raise

@app.post('/api/profile/verification/send')
def send_verification(payload: dict, u:User=Depends(current_user), db:Session=Depends(get_db)):
    channel=str(payload.get('channel','')).lower().strip()
    try:
        if channel=='email':
            if u.email_verified: return {'message':'Email is already verified.','verified':True}
            _email_verification_code(u,db)
            return {'message':f'Verification code sent to {u.email}.','verified':False}
        if channel=='phone':
            if u.phone_verified: return {'message':'Phone number is already verified.','verified':True}
            if not u.phone: raise HTTPException(400,'Add a phone number before verifying it.')
            if not twilio_configured(): raise HTTPException(503,'Phone verification is not configured. Add Twilio settings to backend/.env.')
            twilio_start_sms(u.phone)
            return {'message':f'Verification code sent to {u.phone}.','verified':False}
        raise HTTPException(400,'Verification channel must be email or phone.')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503,str(exc))

@app.post('/api/profile/verification/verify')
def verify_code(payload:VerificationCodeIn, u:User=Depends(current_user), db:Session=Depends(get_db)):
    channel=payload.channel.lower().strip(); code=payload.code.strip()
    try:
        if channel=='email':
            expires=_normalize_expiry(u.email_verification_expires)
            if not u.email_verification_code or not expires or expires < utcnow() or not hmac.compare_digest(u.email_verification_code, hash_otp(code)):
                raise HTTPException(400,'Invalid or expired verification code.')
            u.email_verified=True; u.email_verification_code=None; u.email_verification_expires=None
        elif channel=='phone':
            if not u.phone: raise HTTPException(400,'Add a phone number before verifying it.')
            if not twilio_configured(): raise HTTPException(503,'Phone verification is not configured.')
            result=twilio_check_sms(u.phone, code)
            if result.get('status')!='approved': raise HTTPException(400,'Invalid or expired verification code.')
            u.phone_verified=True
        else:
            raise HTTPException(400,'Verification channel must be email or phone.')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503,str(exc))
    db.commit(); db.refresh(u)
    return {'message':f'{channel.title()} verified successfully.','user':user_payload(u)}

def recalc_flags(db, user_id):
    rows=db.query(Transaction).filter(Transaction.user_id==user_id).all()
    subs=detect_subscription(rows); anoms=detect_anomalies(rows)
    for r in rows:
        r.is_subscription=r.id in subs; r.is_anomaly=r.id in anoms
    db.commit()

@app.post('/api/transactions/upload')
async def upload(file:UploadFile=File(...), replace:bool=False, u:User=Depends(current_user), db:Session=Depends(get_db)):
    raw=await file.read(); name=(file.filename or '').lower()
    try:
        if name.endswith('.xlsx'):
            df=pd.read_excel(io.BytesIO(raw))
        else:
            df=pd.read_csv(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(400,f'Could not parse statement: {e}')
    cols={c.lower().strip():c for c in df.columns}
    def pick(*keys):
        for k in keys:
            if k in cols:return cols[k]
        return None
    date_col=pick('date','transaction date','txn date','value date')
    desc_col=pick('description','details','narration','merchant','transaction description')
    amt_col=pick('amount','transaction amount','value')
    type_col=pick('type','transaction type','txn type','credit/debit','dr/cr','transaction category')
    credit_col=pick('credit','credits','credit amount','cr','credit value')
    debit_col=pick('debit','debits','debit amount','dr','debit value')
    if not date_col or not desc_col: raise HTTPException(400,'Statement needs Date and Description columns')
    if replace:
        db.query(Transaction).filter(Transaction.user_id==u.id).delete(); db.commit()
    added=0
    for _,r in df.iterrows():
        try:
            d=pd.to_datetime(r[date_col]).date()
            desc=str(r[desc_col])
            def num(v):
                if v is None or (isinstance(v,float) and pd.isna(v)): return 0.0
                text=str(v).strip().replace(',','').replace('₹','')
                if text in ('','-','—','nan','None'): return 0.0
                return abs(float(text))
            def normalize_type(v):
                if v is None or (isinstance(v,float) and pd.isna(v)): return None
                t=str(v).strip().lower()
                if t in {'credit','cr','income','deposit','salary','credit transaction','c'} or 'credit' in t or t.startswith('cr'):
                    return 'income'
                if t in {'debit','dr','expense','withdrawal','payment','debit transaction','d'} or 'debit' in t or t.startswith('dr'):
                    return 'expense'
                return None
            hinted=normalize_type(r[type_col]) if type_col else None
            if amt_col:
                raw_text=str(r[amt_col]).strip().replace(',','').replace('₹','')
                val=float(raw_text)
                if hinted:
                    typ=hinted
                else:
                    typ='income' if val>0 else 'expense'
                amount=abs(val)
            else:
                credit=num(r[credit_col]) if credit_col else 0.0
                debit=num(r[debit_col]) if debit_col else 0.0
                if credit>0 and debit==0: amount=credit; typ='income'
                elif debit>0 and credit==0: amount=debit; typ='expense'
                elif hinted:
                    amount=max(credit,debit)
                    typ=hinted
                else: continue
            db.add(Transaction(user_id=u.id,txn_date=d,description=desc,amount=amount,txn_type=typ,category=categorize(desc,amount),merchant=merchant_from(desc)))
            added+=1
        except Exception: continue
    db.commit(); recalc_flags(db,u.id)
    return {'added':added,'message':f'Imported {added} transactions'}

@app.get('/api/transactions')
def transactions(limit:int=200, u:User=Depends(current_user), db:Session=Depends(get_db)):
    rows=db.query(Transaction).filter(Transaction.user_id==u.id).order_by(Transaction.txn_date.desc(),Transaction.id.desc()).limit(limit).all()
    return [serialize_txn(x) for x in rows]

def serialize_txn(x):
    return {'id':x.id,'date':x.txn_date.isoformat(),'description':x.description,'amount':abs(float(x.amount or 0)),'signed_amount':float(x.amount or 0) if x.txn_type=='income' else -abs(float(x.amount or 0)),'type':x.txn_type,'category':x.category,'merchant':x.merchant,'subscription':x.is_subscription,'anomaly':x.is_anomaly,'account':x.account}

@app.post('/api/transactions')
def create_transaction(x: TransactionIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    category = (x.category or '').strip() or categorize(x.description, abs(x.amount))
    merchant = (x.merchant or '').strip() or merchant_from(x.description)
    row = Transaction(user_id=u.id, txn_date=x.date, description=x.description.strip(), amount=abs(float(x.amount)), txn_type=x.type, category=category, merchant=merchant, account=(x.account or '').strip() or 'Primary')
    db.add(row); db.commit(); db.refresh(row); recalc_flags(db,u.id)
    return serialize_txn(row)

@app.post('/api/transactions/bulk')
def create_transactions_bulk(x: TransactionBulkIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows=[]
    for item in x.transactions:
        category=(item.category or '').strip() or categorize(item.description, abs(item.amount))
        merchant=(item.merchant or '').strip() or merchant_from(item.description)
        row=Transaction(user_id=u.id, txn_date=item.date, description=item.description.strip(), amount=abs(float(item.amount)), txn_type=item.type, category=category, merchant=merchant, account=(item.account or '').strip() or 'Primary')
        db.add(row); rows.append(row)
    db.commit(); recalc_flags(db,u.id)
    for row in rows: db.refresh(row)
    return {'added':len(rows),'transactions':[serialize_txn(r) for r in rows]}

@app.post('/api/transactions/delete-selected')
def delete_selected_transactions(x: TransactionDeleteIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    deleted = db.query(Transaction).filter(Transaction.user_id==u.id, Transaction.id.in_(x.ids)).delete(synchronize_session=False)
    db.commit(); recalc_flags(db,u.id)
    return {'deleted':deleted,'message':f'Deleted {deleted} transaction(s).'}

@app.delete('/api/transactions')
def clear_transactions(u:User=Depends(current_user), db:Session=Depends(get_db)):
    db.query(Transaction).filter(Transaction.user_id==u.id).delete(); db.commit(); return {'ok':True}

@app.get('/api/dashboard')
def dashboard(year: int | None = None, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Return a defensive dashboard snapshot.

    This endpoint is intentionally tolerant of empty or partially configured accounts so
    Overview and Budget Lab can always render instead of turning a missing value into a
    network-looking failure in the browser.
    """
    try:
        tx = db.query(Transaction).filter(Transaction.user_id == u.id).order_by(Transaction.txn_date.asc(), Transaction.id.asc()).all()
        budgets_rows = db.query(Budget).filter(Budget.user_id == u.id).order_by(Budget.month.desc(), Budget.id.desc()).all()
        goals_rows = db.query(Goal).filter(Goal.user_id == u.id).order_by(Goal.id.desc()).all()
        inv_rows = db.query(Investment).filter(Investment.user_id == u.id).order_by(Investment.id.desc()).all()
        asset_rows = db.query(Asset).filter(Asset.user_id == u.id).all()
        liability_rows = db.query(Liability).filter(Liability.user_id == u.id).all()

        income = sum(float(x.amount or 0) for x in tx if x.txn_type == 'income')
        expense = sum(float(x.amount or 0) for x in tx if x.txn_type == 'expense')
        monthly: dict[str, dict[str, float]] = {}
        categories: dict[str, float] = {}
        year_values = set()
        for x in tx:
            if not x.txn_date:
                continue
            key = x.txn_date.strftime('%Y-%m')
            year_values.add(x.txn_date.year)
            bucket = monthly.setdefault(key, {'income': 0.0, 'expense': 0.0})
            bucket['income' if x.txn_type == 'income' else 'expense'] += float(x.amount or 0)
            if x.txn_type == 'expense':
                categories[x.category or 'Other'] = categories.get(x.category or 'Other', 0.0) + float(x.amount or 0)

        available_years = sorted(year_values, reverse=True)
        requested_year = int(year) if year is not None else None
        selected_year = requested_year if requested_year in year_values else (available_years[0] if available_years else (requested_year or date.today().year))
        months = [f'{selected_year}-{m:02d}' for m in range(1, 13)]
        monthly_chart = [
            {'month': key, 'income': round(float(monthly.get(key, {}).get('income', 0.0)), 2), 'expense': round(float(monthly.get(key, {}).get('expense', 0.0)), 2)}
            for key in months
        ]

        assets = sum(float(a.value or 0) for a in asset_rows)
        liabilities = sum(float(l.balance or 0) for l in liability_rows)
        invested = sum(float(i.current_value or 0) for i in inv_rows)
        recurring = sum(float(x.amount or 0) for x in tx if x.is_subscription and x.txn_type == 'expense')
        savings_rate = ((income - expense) / income * 100.0) if income else 0.0

        # The selected year's trailing months may have no transactions.
        # Always use a zero-filled bucket instead of indexing the sparse map.
        recent = [monthly.get(k, {'income': 0.0, 'expense': 0.0}) for k in months[-3:]]
        avg_inc = sum(x['income'] for x in recent) / len(recent) if recent else 0.0
        avg_exp = sum(x['expense'] for x in recent) / len(recent) if recent else 0.0
        projected_cashflow = avg_inc - avg_exp

        insights = []
        if not tx:
            insights.append({'title': 'Import your first statement', 'detail': 'Upload a bank statement to activate personalized income, expense, budget, and anomaly intelligence.', 'severity': 'info'})
        elif savings_rate < 20:
            insights.append({'title': 'Savings rate needs attention', 'detail': f'Your modeled savings rate is {savings_rate:.1f}%. A 20%+ target can improve resilience.', 'severity': 'warning'})
        if recurring > 0:
            insights.append({'title': 'Recurring spend detected', 'detail': f'About ₹{recurring:,.0f} is classified as recurring or subscription spend.', 'severity': 'info'})
        anomalies = sum(1 for x in tx if x.is_anomaly)
        if anomalies:
            insights.append({'title': f'{anomalies} unusual transaction(s)', 'detail': 'Large or unusual deviations were flagged for review.', 'severity': 'danger'})
        if categories:
            top_name, top_value = max(categories.items(), key=lambda item: item[1])
            insights.append({'title': 'Top spending category', 'detail': f'{top_name} leads at ₹{top_value:,.0f}.', 'severity': 'info'})

        return {
            'metrics': {
                'income': round(income, 2),
                'expense': round(expense, 2),
                'cashflow': round(income - expense, 2),
                'savings_rate': round(savings_rate, 2),
                'subscriptions': round(recurring, 2),
                'net_worth': round(assets + invested - liabilities, 2),
                'assets': round(assets + invested, 2),
                'liabilities': round(liabilities, 2),
                'investments': round(invested, 2),
                'runway_months': round((assets + invested) / avg_exp, 2) if avg_exp else 0.0,
            },
            'monthly': monthly_chart,
            'selected_year': selected_year,
            'available_years': available_years or [selected_year],
            'categories': sorted([{'category': k, 'value': round(v, 2)} for k, v in categories.items()], key=lambda z: z['value'], reverse=True)[:8],
            'budgets': [
                {'id': b.id, 'category': b.category, 'limit': round(float(b.monthly_limit or 0), 2), 'month': b.month}
                for b in budgets_rows[:12]
            ],
            'goals': [serialize_goal(g) for g in goals_rows],
            'investments': [serialize_inv(i) for i in inv_rows],
            'insights': insights,
            'forecast': {
                'next_month_income': round(avg_inc, 2),
                'next_month_expense': round(avg_exp, 2),
                'next_month_cashflow': round(projected_cashflow, 2),
            },
        }
    except Exception as exc:
        db.rollback()
        print(f'[dashboard] {type(exc).__name__}: {exc}')
        # Return a valid empty payload so the UI stays usable even if an optional table
        # or old database schema needs attention. Authentication/database errors still
        # surface through the normal dependency chain.
        current_year = date.today().year
        months = [f'{current_year}-{m:02d}' for m in range(1, 13)]
        return {
            'metrics': {'income': 0.0, 'expense': 0.0, 'cashflow': 0.0, 'savings_rate': 0.0, 'subscriptions': 0.0, 'net_worth': 0.0, 'assets': 0.0, 'liabilities': 0.0, 'investments': 0.0, 'runway_months': 0.0},
            'monthly': [{'month': m, 'income': 0.0, 'expense': 0.0} for m in months],
            'selected_year': current_year,
            'available_years': [current_year],
            'categories': [], 'budgets': [], 'goals': [], 'investments': [], 'insights': [{'title': 'Dashboard data is being refreshed', 'detail': 'Your account is available. Re-open this workspace after the database tables finish syncing.', 'severity': 'info'}],
            'forecast': {'next_month_income': 0.0, 'next_month_expense': 0.0, 'next_month_cashflow': 0.0},
        }

def serialize_goal(g): return {'id':g.id,'name':g.name,'target':g.target_amount,'current':g.current_amount,'target_date':g.target_date.isoformat() if g.target_date else None,'progress':min(100,g.current_amount/g.target_amount*100 if g.target_amount else 0)}
def serialize_inv(i): return {'id':i.id,'asset':i.asset,'type':i.asset_type,'invested':i.invested_amount,'current':i.current_value,'return_pct':((i.current_value/i.invested_amount-1)*100) if i.invested_amount else 0,'units':i.units}

@app.get('/api/budgets')
def budgets(u:User=Depends(current_user),db:Session=Depends(get_db)):
    return [{'id':b.id,'category':b.category,'limit':b.monthly_limit,'month':b.month} for b in db.query(Budget).filter(Budget.user_id==u.id).order_by(Budget.month.desc()).all()]
@app.post('/api/budgets')
def add_budget(x:BudgetIn,u:User=Depends(current_user),db:Session=Depends(get_db)):
    b=Budget(user_id=u.id,**x.model_dump()); db.add(b); db.commit(); db.refresh(b); return {'id':b.id,**x.model_dump()}
@app.delete('/api/budgets/{bid}')
def del_budget(bid:int,u:User=Depends(current_user),db:Session=Depends(get_db)):
    db.query(Budget).filter(Budget.id==bid,Budget.user_id==u.id).delete();db.commit();return {'ok':True}

@app.get('/api/goals')
def goals(u:User=Depends(current_user),db:Session=Depends(get_db)): return [serialize_goal(g) for g in db.query(Goal).filter(Goal.user_id==u.id).all()]
@app.post('/api/goals')
def add_goal(x:GoalIn,u:User=Depends(current_user),db:Session=Depends(get_db)):
    g=Goal(user_id=u.id,**x.model_dump()); db.add(g);db.commit();db.refresh(g);return serialize_goal(g)

@app.get('/api/investments')
def investments(u:User=Depends(current_user),db:Session=Depends(get_db)): return [serialize_inv(i) for i in db.query(Investment).filter(Investment.user_id==u.id).all()]
@app.post('/api/investments')
def add_investment(x:InvestmentIn,u:User=Depends(current_user),db:Session=Depends(get_db)):
    i=Investment(user_id=u.id,**x.model_dump());db.add(i);db.commit();db.refresh(i);return serialize_inv(i)

@app.get('/api/networth')
def networth(u:User=Depends(current_user),db:Session=Depends(get_db)):
    a=db.query(Asset).filter(Asset.user_id==u.id).all(); l=db.query(Liability).filter(Liability.user_id==u.id).all(); inv=db.query(Investment).filter(Investment.user_id==u.id).all()
    return {'assets':[{'id':x.id,'name':x.name,'type':x.asset_type,'value':x.value} for x in a],'liabilities':[{'id':x.id,'name':x.name,'type':x.liability_type,'balance':x.balance} for x in l],'investments':[serialize_inv(x) for x in inv], 'totals':{'assets':sum(x.value for x in a)+sum(x.current_value for x in inv),'liabilities':sum(x.balance for x in l),'networth':sum(x.value for x in a)+sum(x.current_value for x in inv)-sum(x.balance for x in l)}}
@app.post('/api/networth/assets')
def add_asset(x:AssetIn,u:User=Depends(current_user),db:Session=Depends(get_db)):
    a=Asset(user_id=u.id,**x.model_dump());db.add(a);db.commit();db.refresh(a);return {'id':a.id,**x.model_dump()}
@app.post('/api/networth/liabilities')
def add_liability(x:LiabilityIn,u:User=Depends(current_user),db:Session=Depends(get_db)):
    l=Liability(user_id=u.id,**x.model_dump());db.add(l);db.commit();db.refresh(l);return {'id':l.id,**x.model_dump()}

@app.get('/api/anomalies')
def anomalies(u:User=Depends(current_user),db:Session=Depends(get_db)): return [serialize_txn(x) for x in db.query(Transaction).filter(Transaction.user_id==u.id,Transaction.is_anomaly==True).order_by(Transaction.txn_date.desc()).all()]

@app.post('/api/simulate')
def simulate(payload:dict,u:User=Depends(current_user)):
    monthly=float(payload.get('monthly',10000)); years=int(payload.get('years',5)); annual=float(payload.get('annual_return',12))/100; inflation=float(payload.get('inflation',6))/100
    n=years*12; r=annual/12
    def fv(rate): return monthly*((1+rate)**n-1)/rate*(1+rate) if rate else monthly*n
    scenarios=[{'name':'Conservative','rate':0.08,'value':fv(0.08/12)},{'name':'Base','rate':annual,'value':fv(r)},{'name':'Optimistic','rate':0.16,'value':fv(0.16/12)}]
    invested=monthly*n; future_purchasing=monthly*((1+annual)**years) # informative nominal monthly growth anchor
    return {'inputs':{'monthly':monthly,'years':years,'annual_return':annual*100,'inflation':inflation*100},'invested':invested,'scenarios':scenarios,'gain_base':fv(r)-invested,'inflation_adjusted_base':fv(r)/((1+inflation)**years),'monthly_series':[{'month':i+1,'value':monthly*((1+r)**(i+1)-1)/r*(1+r) if r else monthly*(i+1)} for i in range(n)]}


def finance_snapshot(db, user_id):
    tx=db.query(Transaction).filter(Transaction.user_id==user_id).order_by(Transaction.txn_date.asc(),Transaction.id.asc()).all()
    income=sum(float(x.amount or 0) for x in tx if x.txn_type=='income')
    expense=sum(float(x.amount or 0) for x in tx if x.txn_type=='expense')
    by_month={}
    cats={}
    for x in tx:
        key=x.txn_date.strftime('%Y-%m')
        by_month.setdefault(key,{'income':0.0,'expense':0.0})
        by_month[key][x.txn_type]+=float(x.amount or 0)
        if x.txn_type=='expense': cats[x.category]=cats.get(x.category,0)+float(x.amount or 0)
    months=sorted(by_month)
    recent=months[-6:]
    recent_exp=[by_month[m]['expense'] for m in recent]
    recent_inc=[by_month[m]['income'] for m in recent]
    avg_exp=statistics.mean(recent_exp) if recent_exp else 0
    avg_inc=statistics.mean(recent_inc) if recent_inc else 0
    exp_growth=0
    if len(recent_exp)>=3 and recent_exp[-3] > 0:
        exp_growth=((recent_exp[-1]/recent_exp[-3])**(1/2)-1)*100
    anomalies=sum(1 for x in tx if x.is_anomaly)
    recurring=sum(float(x.amount or 0) for x in tx if x.is_subscription and x.txn_type=='expense')
    return {
        'transaction_count':len(tx),'income':income,'expense':expense,'net':income-expense,
        'savings_rate':((income-expense)/income*100) if income else 0,'avg_monthly_income':avg_inc,
        'avg_monthly_expense':avg_exp,'expense_growth_pct':exp_growth,'recurring_spend':recurring,
        'anomalies':anomalies,'top_categories':sorted(cats.items(),key=lambda x:x[1],reverse=True)[:6],
        'months':[{**{'month':m},**by_month[m]} for m in recent]
    }

def clean_ai_text(text: str) -> str:
    """Normalize model output so the UI never receives half-formatted/raw markup."""
    if not text:
        return ''
    text = str(text).replace('\r\n','\n').replace('\r','\n')
    text = text.replace('<br />','\n').replace('<br/>','\n').replace('<br>','\n')
    text = text.replace('```markdown','').replace('```text','').replace('```','')
    return text.strip().rstrip('*_`|')


def nvidia_call(messages, max_tokens=320, temperature=0.10, mode='fast'):
    key=os.getenv('NVIDIA_API_KEY','').strip()
    if not key or key.startswith('PASTE_'):
        return None
    model=os.getenv('NVIDIA_MODEL','nvidia/nemotron-3-ultra-550b-a55b').strip()
    url=os.getenv('NVIDIA_BASE_URL','https://integrate.api.nvidia.com/v1').rstrip('/') + '/chat/completions'
    deep = mode == 'deep'
    # Fast mode intentionally disables reasoning and asks for one compact, complete answer.
    payload={
        'model':model,
        'messages':messages,
        'temperature':temperature,
        'top_p':0.85,
        'max_tokens':max_tokens,
        'stream':False,
        'chat_template_kwargs':{'enable_thinking':deep,'force_nonempty_content':True},
    }
    try:
        res=_NVIDIA_HTTP.post(url,headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json=payload)
        if res.status_code >= 400:
            print('NVIDIA request failed:', res.status_code, res.text[:500])
            return None
        data=res.json()
        choice=(data.get('choices') or [{}])[0]
        finish=choice.get('finish_reason')
        content=clean_ai_text((choice.get('message') or {}).get('content',''))
        # A length-stop means the model was cut off. Retry once with a larger completion budget,
        # rather than showing an incomplete answer to the user.
        if finish == 'length' and mode == 'fast':
            retry_payload={**payload, 'max_tokens':520}
            res2=_NVIDIA_HTTP.post(url,headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},json=retry_payload)
            if res2.status_code < 400:
                data2=res2.json(); choice2=(data2.get('choices') or [{}])[0]
                content2=clean_ai_text((choice2.get('message') or {}).get('content',''))
                if content2:
                    return content2
        return content
    except Exception as exc:
        print('NVIDIA request failed:',exc)
        return None

@app.get('/api/ai/status')
def ai_status():
    key=os.getenv('NVIDIA_API_KEY','').strip()
    return {'configured':bool(key and not key.startswith('PASTE_')), 'model':os.getenv('NVIDIA_MODEL','nvidia/nemotron-3-ultra-550b-a55b'), 'endpoint':'https://integrate.api.nvidia.com/v1/chat/completions'}

@app.get('/api/ai/predictions')
def ai_predictions(u:User=Depends(current_user), db:Session=Depends(get_db)):
    snap=finance_snapshot(db,u.id)
    avg_exp=snap['avg_monthly_expense']; avg_inc=snap['avg_monthly_income']; growth=snap['expense_growth_pct']
    next_exp=max(0,avg_exp*(1+growth/100))
    next_inc=max(0,avg_inc)
    savings=next_inc-next_exp
    reserve=max(next_exp*3,0)
    cards=[
      {'label':'Next-month expense','value':f'₹{next_exp:,.0f}','detail':f'History-based estimate using the recent monthly trend ({growth:+.1f}% trend).','severity':'warning' if growth>5 else 'info'},
      {'label':'Next-month cash flow','value':f'₹{savings:,.0f}','detail':'Projected income minus projected expenses using your recent pattern.','severity':'success' if savings>=0 else 'danger'},
      {'label':'3-month safety reserve','value':f'₹{reserve:,.0f}','detail':'A simple liquidity target based on your modeled monthly expense level.','severity':'info'},
      {'label':'Recurring spend','value':f'₹{snap["recurring_spend"]:,.0f}','detail':f'{snap["anomalies"]} unusual transaction(s) are currently flagged for review.','severity':'warning' if snap['recurring_spend']>0 else 'info'}
    ]
    return {'cards':cards,'snapshot':snap}

@app.get('/api/ai/insights')
def ai_insights(u:User=Depends(current_user), db:Session=Depends(get_db)):
    snap=finance_snapshot(db,u.id)
    top=', '.join([f'{k}: ₹{v:,.0f}' for k,v in snap['top_categories']]) or 'No expense categories available'
    prompt=[
      {'role':'system','content':'You are FinSight, a conservative personal-finance AI. Analyze only the supplied data. Never invent transactions, balances, returns, or market facts. Give 3 concise insights with a practical action for each. Avoid claiming regulated financial advice.'},
      {'role':'user','content':f'Financial snapshot: income ₹{snap["income"]:,.0f}; expenses ₹{snap["expense"]:,.0f}; net ₹{snap["net"]:,.0f}; savings rate {snap["savings_rate"]:.1f}%; avg monthly expense ₹{snap["avg_monthly_expense"]:,.0f}; expense trend {snap["expense_growth_pct"]:+.1f}%; recurring spend ₹{snap["recurring_spend"]:,.0f}; anomalies {snap["anomalies"]}; top categories {top}. Return 3 labeled insights.'}
    ]
    text=nvidia_call(prompt,max_tokens=220,temperature=0.10,mode='fast')
    if text:
        return {'items':[{'title':'NVIDIA financial readout','detail':text,'severity':'info'}],'source':'nvidia'}
    items=[]
    if snap['savings_rate']<20: items.append({'title':'Savings rate is below 20%','detail':f'Current modeled rate is {snap["savings_rate"]:.1f}%. Start by trimming the largest variable category.','severity':'warning'})
    if snap['expense_growth_pct']>5: items.append({'title':'Expense trend is accelerating','detail':f'Recent expense growth is about {snap["expense_growth_pct"]:.1f}%. Review recurring and discretionary purchases.','severity':'danger'})
    if snap['anomalies']: items.append({'title':'Review flagged transactions','detail':f'{snap["anomalies"]} transaction(s) were identified as unusual.','severity':'danger'})
    if not items: items.append({'title':'Financial pattern is stable','detail':'No critical behavioral warning was detected from the imported history.','severity':'info'})
    return {'items':items,'source':'local'}

@app.post('/api/ai/chat/instant')
def ai_chat_instant(payload:dict,u:User=Depends(current_user),db:Session=Depends(get_db)):
    """Return an immediate deterministic financial answer while NVIDIA generates a richer answer in parallel."""
    message=str(payload.get('message','')).strip()
    if not message: raise HTTPException(400,'Message is required')
    snap=finance_snapshot(db,u.id)
    top_pairs=snap.get('top_categories') or []
    top=', '.join([f'{k} ₹{v:,.0f}' for k,v in top_pairs[:4]]) or 'not available yet'
    low=message.lower()
    if any(k in low for k in ('saving','save','savings')):
        reply=(f"Your current modeled savings rate is {snap['savings_rate']:.1f}%, with ₹{snap['net']:,.0f} net cash flow across the imported data. "
               f"Your largest spending categories are {top}. A practical next step is to set one monthly cap on the biggest variable category and redirect the difference to your goal.")
    elif any(k in low for k in ('subscription','recurring')):
        reply=(f"Your imported history shows about ₹{snap['recurring_spend']:,.0f} in recurring spend. "
               f"Review recurring merchants first, then cancel or downgrade anything you no longer use. This is usually the quickest low-friction saving opportunity.")
    elif any(k in low for k in ('forecast','predict','future','next month','cash flow')):
        nxt=max(0,snap['avg_monthly_expense']*(1+snap['expense_growth_pct']/100))
        reply=(f"Using your recent pattern, next-month expenses are estimated around ₹{nxt:,.0f}, with an estimated cash-flow balance of about ₹{snap['avg_monthly_income']-nxt:,.0f}. "
               f"This is a historical trend estimate, not a guarantee.")
    elif any(k in low for k in ('spend','overspend','where','category')):
        reply=(f"Your imported expenses total ₹{snap['expense']:,.0f}. The largest categories are {top}. "
               f"Start by reviewing the largest category that is discretionary rather than fixed; that usually gives the fastest improvement.")
    elif any(k in low for k in ('anomaly','unusual','fraud')):
        reply=(f"FinSight has flagged {snap['anomalies']} unusual transaction(s). "
               "Open Transactions and review the flagged merchants and amounts before treating them as fraud. An anomaly is a review signal, not proof of fraud.")
    else:
        reply=(f"Right now FinSight shows ₹{snap['income']:,.0f} income, ₹{snap['expense']:,.0f} expenses, and ₹{snap['net']:,.0f} net cash flow, "
               f"with a modeled savings rate of {snap['savings_rate']:.1f}%. Ask me about spending, savings, forecasts, anomalies, goals, or investments and I’ll break it down.")
    return {'reply':reply,'source':'instant','model':'FinSight instant engine'}

@app.post('/api/ai/chat')
def ai_chat(payload:dict,u:User=Depends(current_user),db:Session=Depends(get_db)):
    message=str(payload.get('message','')).strip()
    if not message: raise HTTPException(400,'Message is required')
    history=payload.get('history') or []
    mode=str(payload.get('mode','fast')).lower()
    snap=finance_snapshot(db,u.id)
    top=', '.join([f'{k} ₹{v:,.0f}' for k,v in snap['top_categories'][:4]]) or 'No category data yet'
    system=('You are FinSight AI, a warm, highly capable personal-finance copilot. '
            'Use only the supplied FinSight data. Answer the user directly in 4-7 short sentences or up to 4 bullets. '
            'Do not create markdown tables. Do not use HTML such as <br>. Do not use decorative markdown. '
            'Never invent numbers. For calculations, state the key number and the assumption. '
            'For recommendations, give 2-3 practical actions. Keep the response complete and self-contained, never cut it off mid-sentence. '
            'For investments, mention uncertainty and risk briefly and avoid presenting regulated advice.')
    context=(f'Financial context: income ₹{snap["income"]:,.0f}; expenses ₹{snap["expense"]:,.0f}; net ₹{snap["net"]:,.0f}; '
             f'savings rate {snap["savings_rate"]:.1f}%; avg monthly income ₹{snap["avg_monthly_income"]:,.0f}; '
             f'avg monthly expense ₹{snap["avg_monthly_expense"]:,.0f}; expense trend {snap["expense_growth_pct"]:+.1f}%; '
             f'recurring spend ₹{snap["recurring_spend"]:,.0f}; anomalies {snap["anomalies"]}; top categories {top}; '
             f'transactions {snap["transaction_count"]}.')
    msgs=[{'role':'system','content':system},{'role':'user','content':context}]
    for item in history[-4:]:
        role=item.get('role'); content=str(item.get('content','')).strip()[:700]
        if role in ('user','assistant') and content: msgs.append({'role':role,'content':content})
    msgs.append({'role':'user','content':message})
    text=nvidia_call(msgs,max_tokens=320 if mode=='fast' else 720,temperature=0.10 if mode=='fast' else 0.22,mode=mode)
    if text: return {'reply':text,'source':'nvidia','model':os.getenv('NVIDIA_MODEL','nvidia/nemotron-3-ultra-550b-a55b')}
    low=message.lower()
    if 'saving' in low or 'save' in low:
        reply=f'Your current modeled savings rate is {snap["savings_rate"]:.1f}%. Your largest expense category is {top.split(",")[0] if top else "not available"}. A strong next step is to set one spending cap and redirect that amount to your top goal.'
    elif 'subscription' in low or 'recurring' in low:
        reply=f'Your imported history shows about ₹{snap["recurring_spend"]:,.0f} in recurring spend. I would review each recurring merchant and keep only the services you actively use.'
    elif 'forecast' in low or 'predict' in low or 'future' in low:
        nxt=snap['avg_monthly_expense']*(1+snap['expense_growth_pct']/100); reply=f'Using your recent imported pattern, I estimate next-month expenses around ₹{nxt:,.0f}. That is a trend estimate, not a guarantee.'
    elif 'where' in low or 'spend' in low:
        reply=f'Your top spending categories are {top or "not available yet"}. Total imported expenses are ₹{snap["expense"]:,.0f}. I would start by tightening the largest variable category.'
    else:
        reply=f'Your imported data currently shows ₹{snap["income"]:,.0f} income, ₹{snap["expense"]:,.0f} expenses and ₹{snap["net"]:,.0f} net cash flow. Ask me about any of those numbers and I can break them down.'
    return {'reply':reply,'source':'local'}

@app.post('/api/ai/chat/stream')
def ai_chat_stream(payload:dict,u:User=Depends(current_user),db:Session=Depends(get_db)):
    """Compatibility endpoint: returns one complete SSE event, never a partial token stream."""
    from fastapi.responses import StreamingResponse
    import json
    result=ai_chat(payload,u,db)
    def events():
        yield 'data: '+json.dumps({'content':result.get('reply',''),'source':result.get('source','local'),'complete':True})+'\n\n'
        yield 'data: [DONE]\n\n'
    return StreamingResponse(events(),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})

@app.get('/api/report')
def report(u:User=Depends(current_user),db:Session=Depends(get_db)):
    tx=db.query(Transaction).filter(Transaction.user_id==u.id).all(); income=sum(x.amount for x in tx if x.txn_type=='income'); expense=sum(x.amount for x in tx if x.txn_type=='expense')
    category={}
    for x in tx:
        if x.txn_type=='expense':category[x.category]=category.get(x.category,0)+x.amount
    return {'period':'All imported data','income':income,'expense':expense,'net':income-expense,'categories':category,'subscriptions':sum(x.amount for x in tx if x.is_subscription),'anomalies':sum(1 for x in tx if x.is_anomaly),'generated_at':datetime.now().isoformat()}

@app.post('/api/chat')
def chat(x:ChatIn,u:User=Depends(current_user),db:Session=Depends(get_db)):
    tx=db.query(Transaction).filter(Transaction.user_id==u.id).all(); msg=x.message.lower(); inc=sum(t.amount for t in tx if t.txn_type=='income'); exp=sum(t.amount for t in tx if t.txn_type=='expense');
    cats={}
    for t in tx:
        if t.txn_type=='expense':cats[t.category]=cats.get(t.category,0)+t.amount
    top=max(cats.items(),key=lambda z:z[1]) if cats else ('Other',0)
    if 'saving' in msg or 'save' in msg:
        reply=f'Your modeled savings rate is {(inc-exp)/inc*100:.1f}% when income is available. Your biggest expense category is {top[0]} at ₹{top[1]:,.0f}. A practical next move is to cap that category and automate the difference into your highest-priority goal.' if inc else 'Import a statement first and I can calculate your savings rate and recommend a target.'
    elif 'subscription' in msg or 'recurring' in msg:
        sub=sum(t.amount for t in tx if t.is_subscription); reply=f'I detected about ₹{sub:,.0f} in recurring/subscription spend across the imported transactions.'
    elif 'forecast' in msg or 'future' in msg:
        reply=f'Based on your imported history, the dashboard estimates next-month cash flow around ₹{max(0,inc-exp):,.0f}. For investment forecasting, use Simulation for explicit scenario assumptions.'
    elif 'where' in msg or 'spend' in msg:
        reply=f'Your largest spending category is {top[0]} at ₹{top[1]:,.0f}. I also flagged {sum(1 for t in tx if t.is_anomaly)} unusual transaction(s) for review.'
    else:
        reply='I can answer questions about spending, saving, subscriptions, cash flow, anomalies, net worth, goals, and investment simulations using your FinSight data.'
    return {'reply':reply}
