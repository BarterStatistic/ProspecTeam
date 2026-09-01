@echo off
setlocal
chcp 65001 >nul
title Buro Automatico - servicio de llenado

rem Arranca el servicio que llena Refacil desde Marga. Pensado para doble clic:
rem instala lo que falte la primera vez y despues solo levanta el servidor.
rem Sin acentos a proposito: la consola de Windows los rompe segun la region.

cd /d "%~dp0"

echo.
echo   ================================================
echo    Buro Automatico - servicio de llenado
echo   ================================================
echo.

rem --- 1. Python -------------------------------------------------------------
where python >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] No se encontro Python en esta computadora.
  echo.
  echo   Instalalo desde:  https://www.python.org/downloads/
  echo.
  echo   IMPORTANTE: durante la instalacion marca la casilla
  echo   "Add python.exe to PATH", si no, este archivo no lo va a encontrar.
  echo.
  pause
  exit /b 1
)

rem --- 2. Microsoft Edge -----------------------------------------------------
rem Selenium maneja Edge; si no esta, el llenado falla al abrir la ventana.
if not exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  if not exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    echo   [AVISO] No se encontro Microsoft Edge en la ruta habitual.
    echo   Si el llenado falla al abrir la ventana, instala Edge desde:
    echo   https://www.microsoft.com/edge
    echo.
  )
)

rem --- 3. Dependencias -------------------------------------------------------
python -c "import flask, selenium" >nul 2>nul
if errorlevel 1 (
  echo   Primera vez en esta computadora: instalando dependencias.
  echo   Tarda un par de minutos y necesita internet. Espera...
  echo.
  python -m pip install --quiet --disable-pip-version-check -r requirements.txt
  if errorlevel 1 (
    echo.
    echo   [ERROR] No se pudieron instalar las dependencias.
    echo   Revisa que tengas internet y vuelve a intentar.
    echo.
    pause
    exit /b 1
  )
  echo   Dependencias listas.
  echo.
)

rem --- 4. Arrancar -----------------------------------------------------------
echo   Todo listo. El servicio queda escuchando en http://localhost:5000
echo.
echo   DEJA ESTA VENTANA ABIERTA mientras captures clientes en Marga.
echo   Para detenerlo: cierra la ventana.
echo.
echo   ------------------------------------------------
echo.

python app.py

echo.
echo   El servicio se detuvo.
pause
