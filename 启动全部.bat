@echo off
chcp 936 >nul
title 生产订单与物流管理系统 - 一键启动
cd /d "%~dp0"

echo.
echo   ============================================
echo     一键启动：数据库 - 后端 - 前端
echo   ============================================
echo.

rem 找 MySQL
set BASE=
if exist "C:\lab5-mysql\mysql-8.0.29-winx64\bin\mysqld.exe" set BASE=C:\lab5-mysql\mysql-8.0.29-winx64
if not defined BASE if exist "%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64\bin\mysqld.exe" set BASE=%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64

rem 1 数据库
if not defined BASE (
  echo   [1/3] 没找到 MySQL，跳过数据库
  echo         要连真库请先双击 安装数据库.bat
  goto :backend
)

"%BASE%\bin\mysqladmin.exe" -h 127.0.0.1 -P 3307 -u root ping >nul 2>nul
if not errorlevel 1 (
  echo   [1/3] 数据库已在运行 127.0.0.1:3307
  goto :backend
)

echo   [1/3] 启动数据库...
start "MES 数据库" "%~dp0启动数据库.bat"
call :waitport 3307 30
if errorlevel 1 (
  echo   [!] 数据库 30 秒内没起来，看"MES 数据库"那个窗口的报错
  pause
  exit /b 1
)
echo         数据库就绪

:backend
rem 2 后端
call :portup 3000
if "%UP%"=="1" (
  echo   [2/3] 后端已在运行 127.0.0.1:3000
  goto :front
)

echo   [2/3] 启动后端...
start "MES 后端" "%~dp0启动后端.bat"
call :waitport 3000 40
if errorlevel 1 (
  echo   [!] 后端 40 秒内没起来，看"MES 后端"那个窗口的报错
  pause
  exit /b 1
)
echo         后端就绪

:front
rem 3 前端（会自动打开浏览器，地址带 ?api=）
call :portup 5173
if "%UP%"=="1" (
  echo   [3/3] 前端已在运行
  echo         请手动打开 http://localhost:5173/?api=http://127.0.0.1:3000
  goto :done
)
echo   [3/3] 启动前端...
start "MES 前端" "%~dp0启动系统.bat"

:done
echo.
echo   三个窗口别关：MES 数据库 / MES 后端 / MES 前端。
echo   地址：http://localhost:5173/?api=http://127.0.0.1:3000
echo.
echo   停止：关掉这三个窗口即可。
echo.
timeout /t 5 >nul
exit /b 0

rem ---- 子过程 ----
:portup
rem %1 端口 -> 设 UP=1/0
set UP=0
for /f "tokens=*" %%a in ('netstat -an ^| findstr /C:":%1 " ^| findstr /C:"LISTENING"') do set UP=1
exit /b 0

:waitport
rem %1 端口  %2 最多等几秒
set /a _n=0
:waitport_loop
call :portup %1
if "%UP%"=="1" exit /b 0
set /a _n+=1
if %_n% GEQ %2 exit /b 1
timeout /t 1 >nul
goto :waitport_loop
