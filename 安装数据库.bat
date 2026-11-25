@echo off
chcp 936 >nul
title 安装 MySQL 8.0.29（免安装版）
cd /d "%~dp0"

set MIRROR=https://repo.huaweicloud.com/mysql/Downloads/MySQL-8.0
set PKG=mysql-8.0.29-winx64.zip
set DEST=%LOCALAPPDATA%\lab5-mysql
set BASE=%DEST%\mysql-8.0.29-winx64
set DATA=%DEST%\data

echo.
echo   ============================================
echo     安装 MySQL 8.0.29（免安装，免管理员）
echo   ============================================
echo.
echo   安装位置：%DEST%
echo   端口    ：3307
echo   账号    ：root（空密码）
echo.
echo   需要联网下载约 214 MB，请耐心等待。
echo.

if exist "%BASE%\bin\mysqld.exe" (
  echo   [√] 已经装过了，跳过下载与解压。
  goto :init
)

where curl >nul 2>nul
if errorlevel 1 (
  echo   [!] 系统没有 curl，无法自动下载。
  echo       请手动下载后解压到：%DEST%
  echo       下载地址：%MIRROR%/%PKG%
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"

echo   正在下载 %PKG% ...
curl -L -o "%DEST%\%PKG%" "%MIRROR%/%PKG%"
if errorlevel 1 (
  echo   [!] 下载失败，请检查网络，或手动下载：
  echo       %MIRROR%/%PKG%
  pause
  exit /b 1
)

echo   正在解压 ...
tar -xf "%DEST%\%PKG%" -C "%DEST%"
if not exist "%BASE%\bin\mysqld.exe" (
  echo   [!] 解压后没找到 %BASE%\bin\mysqld.exe
  pause
  exit /b 1
)
del "%DEST%\%PKG%" >nul 2>nul

:init
if exist "%DATA%\mysql.ibd" (
  echo   [√] 数据目录已存在，跳过初始化。
  goto :start
)

echo   正在初始化数据目录 ...
"%BASE%\bin\mysqld.exe" --no-defaults --initialize-insecure --basedir="%BASE%" --datadir="%DATA%"
if errorlevel 1 (
  echo   [!] 初始化失败。
  pause
  exit /b 1
)

:start
echo.
echo   正在启动数据库 ...
start "" "%BASE%\bin\mysqld.exe" --no-defaults --basedir="%BASE%" --datadir="%DATA%" --port=3307 --bind-address=127.0.0.1 --character-set-server=utf8mb4 --collation-server=utf8mb4_general_ci

echo   等待数据库就绪 ...
set /a tries=0
:wait
set /a tries+=1
"%BASE%\bin\mysqladmin.exe" -h 127.0.0.1 -P 3307 -u root ping >nul 2>nul
if not errorlevel 1 goto :ready
if %tries% GEQ 30 (
  echo   [!] 数据库启动超时。请双击 启动数据库.bat，
  echo       它会在窗口里直接显示报错信息。
  pause
  exit /b 1
)
timeout /t 1 >nul
goto :wait

:ready
echo   [√] 数据库已就绪：127.0.0.1:3307
echo.
echo   下一步：双击 初始化数据库.bat 建表并导入演示数据。
echo.
pause
