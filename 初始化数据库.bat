@echo off
chcp 936 >nul
title 初始化数据库（建表 + 导入演示数据）
cd /d "%~dp0"

echo.
echo   ============================================
echo     初始化数据库 lab5_mes
echo   ============================================
echo.

rem ---- 找 MySQL 客户端：本机固定位置 / 免安装版默认位置 ----
set BASE=
if exist "C:\lab5-mysql\mysql-8.0.29-winx64\bin\mysql.exe" set BASE=C:\lab5-mysql\mysql-8.0.29-winx64
if not defined BASE if exist "%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64\bin\mysql.exe" set BASE=%LOCALAPPDATA%\lab5-mysql\mysql-8.0.29-winx64

if not defined BASE (
  echo   [!] 没找到 MySQL，请先双击 安装数据库.bat
  echo       或把本脚本里的 BASE 改成你自己的 MySQL 目录。
  pause
  exit /b 1
)

set MYSQL=%BASE%\bin\mysql.exe

echo   MySQL ：%BASE%
echo   目标  ：127.0.0.1:3307  用户 root  库 lab5_mes
echo.

rem ---- 先确认服务在跑 ----
"%BASE%\bin\mysqladmin.exe" -h 127.0.0.1 -P 3307 -u root ping >nul 2>nul
if errorlevel 1 (
  echo   [!] 数据库没在运行。请先双击 启动数据库.bat，再回来执行本脚本。
  pause
  exit /b 1
)

if not exist "db\01-schema.sql" (
  echo   [!] 找不到 db\01-schema.sql，请在 lab5-web 目录下运行本脚本。
  pause
  exit /b 1
)

echo   注意：01-schema.sql 开头会 DROP DATABASE lab5_mes，
echo         相当于把数据重置回初始演示状态。
echo.
pause

for %%f in (01-schema.sql 02-data.sql 03-proc.sql 04-queries.sql) do (
  echo.
  echo   === 执行 db\%%f ===
  "%MYSQL%" -h 127.0.0.1 -P 3307 -u root --default-character-set=utf8mb4 -e "source db/%%f"
  if errorlevel 1 (
    echo.
    echo   [!] db\%%f 执行失败，已停止。
    pause
    exit /b 1
  )
  echo   [√] db\%%f 完成
)

echo.
echo   === 核对结果 ===
"%MYSQL%" -h 127.0.0.1 -P 3307 -u root --default-character-set=utf8mb4 -e "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='lab5_mes' AND table_type='BASE TABLE') AS 表, (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='lab5_mes' AND table_type='VIEW') AS 视图, (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='lab5_mes') AS 存储过程, (SELECT COUNT(*) FROM lab5_mes.work_order) AS 工单, (SELECT COUNT(*) FROM lab5_mes.item) AS 物料, (SELECT SUM(qty) FROM lab5_mes.stock_balance) AS 库存合计;"

echo.
echo   [√] 初始化完成。现在可以双击 启动后端.bat 了。
echo.
pause
