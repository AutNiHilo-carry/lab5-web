@echo off
chcp 936 >nul
title MySQL 8.0.29 (端口 3307)
cd /d "%~dp0"

rem ---- 找安装位置：本机固定位置 / 免安装版默认位置 ----
set BASE=
if exist "C:\lab5-mysql\mysql-8.0.29-winx64\bin\mysqld.exe" set BASE=C:\lab5-mysql\mysql-8.0.29-winx64
if not defined BASE if exist "%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64\bin\mysqld.exe" set BASE=%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64

echo.
echo   ============================================
echo     MySQL 8.0.29  -  数据库服务
echo   ============================================
echo.

if not defined BASE (
  echo   [!] 没找到 MySQL。
  echo       第一次使用请先双击 安装数据库.bat（自动下载安装，约 214MB）。
  pause
  exit /b 1
)

rem 数据目录：跟安装目录同级（C:\lab5-mysql\data 或 %LOCALAPPDATA%\lab5-mysql\data）
for %%d in ("%BASE%") do set ROOT=%%~dpd
set DATA=%ROOT%data

if not exist "%DATA%\mysql.ibd" (
  echo   [!] 数据目录还没初始化：%DATA%
  echo       请先双击 安装数据库.bat。
  pause
  exit /b 1
)

rem 已在运行就不重复启动
"%BASE%\bin\mysqladmin.exe" -h 127.0.0.1 -P 3307 -u root ping >nul 2>nul
if not errorlevel 1 (
  echo   数据库已经在运行：127.0.0.1:3307
  echo   用户 root   密码为空   库 lab5_mes
  echo.
  echo   要停止请双击 停止数据库.bat
  timeout /t 5 >nul
  exit /b 0
)

echo   启动中：127.0.0.1:3307
echo   用户 root   密码为空   库 lab5_mes
echo.
echo   关闭本窗口即停止数据库；要一直开着请最小化本窗口。
echo.

"%BASE%\bin\mysqld.exe" --no-defaults --basedir="%BASE%" --datadir="%DATA%" --port=3307 --bind-address=127.0.0.1 --character-set-server=utf8mb4 --collation-server=utf8mb4_general_ci --default-time-zone=+08:00 --console

echo.
echo   数据库已停止。
pause
