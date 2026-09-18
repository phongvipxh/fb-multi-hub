@echo off
chcp 65001 >nul
cd /d "%~dp0"
title FB Multi-Page Tool - Khoi Dong

echo ============================================================
echo    FB MULTI-PAGE TOOL - KHOI DONG TU DONG 1-CLICK
echo ============================================================
echo Dang kiem tra moi truong va khoi chay...

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_and_start.ps1"

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [LOI] Khong the khoi dong chuong trinh.
    echo Vui long kiem tra ket noi Internet hoac thu chay bang quyen Administrator.
    echo ============================================================
    pause
)
