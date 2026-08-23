@echo off
start "FinSight Backend" cmd /k "%~dp0run_backend.bat"
timeout /t 3 >nul
start "FinSight Frontend" cmd /k "%~dp0run_frontend.bat"
