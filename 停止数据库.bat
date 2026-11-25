@echo off
chcp 936 >nul
title 停止 MySQL

rem ---- 找安装位置：本机固定位置 / 免安装版默认位置 ----
set BASE=
if exist "C:\lab5-mysql\mysql-8.0.29-winx64\bin\mysqladmin.exe" set BASE=C:\lab5-mysql\mysql-8.0.29-winx64
if not defined BASE if exist "%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64\bin\mysqladmin.exe" set BASE=%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64

echo.
echo   正在停止 MySQL（127.0.0.1:3307）...
echo.

if not defined BASE (
  echo   [!] 没找到 MySQL，本来就无需停止。
  pause
  exit /b 0
)

"%BASE%\bin\mysqladmin.exe" -h 127.0.0.1 -P 3307 -u root shutdown
if errorlevel 1 (
  echo   停止失败：可能数据库本来就没在运行。
) else (
  echo   数据库已停止。
)
echo.
timeout /t 3 >nul
