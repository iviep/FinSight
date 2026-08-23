import os, re, smtplib, secrets, hashlib, hmac
from email.message import EmailMessage
from datetime import datetime, timezone
from urllib.parse import urlencode
import httpx


def utcnow():
    return datetime.now(timezone.utc)


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def make_otp() -> str:
    return f"{secrets.randbelow(900000) + 100000:06d}"


def send_email(subject: str, recipient: str, text_body: str, html_body: str | None = None) -> None:
    host = os.getenv('SMTP_HOST')
    port = int(os.getenv('SMTP_PORT', '587'))
    username = os.getenv('SMTP_USERNAME')
    password = os.getenv('SMTP_PASSWORD')
    sender = os.getenv('SMTP_FROM') or username
    security = os.getenv('SMTP_SECURITY', 'starttls').lower()
    if not all([host, username, password, sender]):
        raise RuntimeError('SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD and SMTP_FROM to backend/.env.')
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = recipient
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype='html')
    if security == 'ssl':
        with smtplib.SMTP_SSL(host, port, timeout=20) as smtp:
            smtp.login(username, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.ehlo(); smtp.starttls(); smtp.ehlo()
            smtp.login(username, password)
            smtp.send_message(msg)


def google_configured() -> bool:
    return bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET') and os.getenv('GOOGLE_REDIRECT_URI'))


def google_authorize_url(state: str) -> str:
    params = {
        'client_id': os.getenv('GOOGLE_CLIENT_ID', ''),
        'redirect_uri': os.getenv('GOOGLE_REDIRECT_URI', ''),
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'offline',
        'prompt': 'select_account',
        'state': state,
    }
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(params)


def google_exchange_code(code: str) -> dict:
    with httpx.Client(timeout=20.0) as client:
        r = client.post('https://oauth2.googleapis.com/token', data={
            'code': code,
            'client_id': os.getenv('GOOGLE_CLIENT_ID', ''),
            'client_secret': os.getenv('GOOGLE_CLIENT_SECRET', ''),
            'redirect_uri': os.getenv('GOOGLE_REDIRECT_URI', ''),
            'grant_type': 'authorization_code',
        })
        r.raise_for_status()
        token = r.json()
        access_token = token.get('access_token')
        if not access_token:
            raise RuntimeError('Google did not return an access token.')
        info = client.get('https://openidconnect.googleapis.com/v1/userinfo', headers={'Authorization': f'Bearer {access_token}'})
        info.raise_for_status()
        return info.json()


def twilio_configured() -> bool:
    return bool(os.getenv('TWILIO_ACCOUNT_SID') and os.getenv('TWILIO_AUTH_TOKEN') and os.getenv('TWILIO_VERIFY_SERVICE_SID'))


def twilio_start_sms(to: str) -> dict:
    if not twilio_configured():
        raise RuntimeError('Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID to backend/.env.')
    url = f"https://verify.twilio.com/v2/Services/{os.environ['TWILIO_VERIFY_SERVICE_SID']}/Verifications"
    with httpx.Client(timeout=20.0) as client:
        r = client.post(url, data={'To': to, 'Channel': 'sms'}, auth=(os.environ['TWILIO_ACCOUNT_SID'], os.environ['TWILIO_AUTH_TOKEN']))
        if r.status_code >= 400:
            try: detail = r.json().get('message') or r.text
            except Exception: detail = r.text
            raise RuntimeError(f'Twilio verification failed: {detail}')
        return r.json()


def twilio_check_sms(to: str, code: str) -> dict:
    if not twilio_configured():
        raise RuntimeError('Twilio is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID to backend/.env.')
    url = f"https://verify.twilio.com/v2/Services/{os.environ['TWILIO_VERIFY_SERVICE_SID']}/VerificationCheck"
    with httpx.Client(timeout=20.0) as client:
        r = client.post(url, data={'To': to, 'Code': code}, auth=(os.environ['TWILIO_ACCOUNT_SID'], os.environ['TWILIO_AUTH_TOKEN']))
        if r.status_code >= 400:
            try: detail = r.json().get('message') or r.text
            except Exception: detail = r.text
            raise RuntimeError(f'Twilio verification check failed: {detail}')
        return r.json()
