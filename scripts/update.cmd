@echo off
setlocal
cd /d "%~dp0.."
echo THORDY - Actualizacion segura
echo Cierra el servidor con Ctrl+C antes de continuar.
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 antes de actualizar.
  pause
  exit /b 1
)
node scripts\update.mjs
if errorlevel 1 (
  echo No se completo la actualizacion. Lee el mensaje anterior; no borres data ni .env.
  pause
  exit /b 1
)
pause
