@echo off
cd /d "%~dp0backend"

py -3.13 -m venv .venv
call .venv\Scripts\activate.bat

python -m pip install -r requirements.txt

if not exist .env copy .env.example .env

python scripts\setup_db.py
python -m scripts.seed

python -m uvicorn app.main:app --reload --port 8000
pause