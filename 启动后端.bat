@echo off
chcp 936 >nul
title 生产订单与物流管理系统 - 后端服务
cd /d "%~dp0server"

echo.
echo   ============================================
echo     生产订单与物流管理系统 - 后端服务
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [!] 未检测到 Node.js，无法启动后端。
  echo       请先装 Node.js（https://nodejs.org），
  echo       或直接双击 启动系统.bat 用纯前端演示。
  pause
  exit /b 1
)

if not exist node_modules (
  echo   首次启动，正在安装依赖（需要联网）...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo   [!] 依赖安装失败，请检查网络或 npm 源。
    pause
    exit /b 1
  )
)

rem ---- 配置：默认连真实 MySQL ----
if not exist .env (
  echo   未找到 .env，生成默认配置（连 127.0.0.1:3307 的 MySQL）...
  > .env echo PORT=3000
  >> .env echo HOST=127.0.0.1
  >> .env echo DB_HOST=127.0.0.1
  >> .env echo DB_PORT=3307
  >> .env echo DB_USER=root
  >> .env echo DB_PASSWORD=
  >> .env echo DB_NAME=lab5_mes
  >> .env echo DB_POOL=10
  >> .env echo USE_MEMORY=false
)

rem ---- 数据库是否在线 ----
set DBBASE=
if exist "C:\lab5-mysql\mysql-8.0.29-winx64\bin\mysqladmin.exe" set DBBASE=C:\lab5-mysql\mysql-8.0.29-winx64
if not defined DBBASE if exist "%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64\bin\mysqladmin.exe" set DBBASE=%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64

if defined DBBASE (
  "%DBBASE%\bin\mysqladmin.exe" -h 127.0.0.1 -P 3307 -u root ping >nul 2>nul
  if errorlevel 1 goto :nodb
  echo   [√] 数据库在线：127.0.0.1:3307  （本服务将连接真实 MySQL）
  goto :start
)
goto :nodb

:nodb
echo.
echo   [!] 没检测到运行中的 MySQL（127.0.0.1:3307）。
echo       要连真实数据库，请按顺序双击：
echo         1) 安装数据库.bat      （第一次才需要，约 214MB）
echo         2) 初始化数据库.bat    （建表 + 导入演示数据）
echo         3) 启动数据库.bat      （每次开机后都要）
echo       然后重新双击本脚本。
echo.
echo       先继续启动也可以：后端会自动退回"内存演示数据"，
echo       接口全部可用，只是数据不落库。
echo.
pause

:start
echo.
echo   接口地址：http://127.0.0.1:3000/api
echo   健康检查：http://127.0.0.1:3000/api/health   ← 看 repo 字段：mysql / memory
echo   前端访问：http://localhost:5173/?api=http://127.0.0.1:3000
echo.
echo   按 Ctrl+C 停止。
echo.

node src/server.mjs
pause
