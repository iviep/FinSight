# FinSight — Personal Financial Intelligence Platform

A full-stack personal finance intelligence dashboard with PostgreSQL, FastAPI and React/Vite.

## Stack
- Frontend: React + Vite + Recharts + Lucide React
- Backend: FastAPI + SQLAlchemy + Pandas
- Database: PostgreSQL (pgAdmin 4 compatible)
- Authentication: JWT + PBKDF2-SHA256, Google OAuth 2.0
- Real verification: SMTP email OTP + Twilio Verify v2 SMS OTP

## PostgreSQL
Configured for:
- Host: localhost
- Port: 5432
- Database: finsight
- User: postgres
- Password: 2301

Create the database in pgAdmin 4 first if it does not exist.

## Run backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Fill every required provider value in backend/.env
python scripts/seed.py
python -m uvicorn app.main:app --reload --port 8000
```

## Run frontend
```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Real account features
- Email/password registration and login
- Google Sign-In from both login and registration
- Password reset by real email OTP
- Real email verification by SMTP OTP
- Real phone verification by Twilio Verify v2 SMS OTP
- Profile image upload and removal
- Personal details stored in PostgreSQL

## Bank statement upload
CSV/XLSX is supported. The importer recognizes Date, Description, Amount, Credit, Debit and transaction type fields. `CREDIT` values are treated as income and `DEBIT` values as expenses even when every amount is positive.

## Simulator
Try ₹10,000/month for 5 years. Adjust return and inflation assumptions to compare Conservative, Base and Optimistic scenarios.

## AI
The AI assistant and AI Intelligence workspace can use the configured NVIDIA NIM endpoint. See `README_NVIDIA_AI.md` and `README_REAL_AUTH.md` for configuration.

## Security
Never commit `backend/.env`. Keep Google, SMTP, Twilio and NVIDIA credentials server-side only.

## No demo data
This build does not create demo users, demo credentials, fake verification codes, or seeded financial records. `backend/scripts/seed.py` only ensures the database tables exist.
