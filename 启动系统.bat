@echo off
chcp 936 >nul
title 生产订单与物流管理系统
cd /d "%~dp0"

echo.
echo   ============================================
echo     生产订单与物流管理系统 - 本地启动
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [!] 未检测到 Node.js，将直接用默认浏览器打开页面
  echo.
  start "" "index.html"
  echo   已打开 index.html（数据保存在浏览器本地）
  timeout /t 5 >nul
  exit /b 0
)

echo   正在启动本地服务，浏览器会自动打开页面...
echo   如需停止，直接关闭本窗口即可。
echo.

node serve.mjs
pause
