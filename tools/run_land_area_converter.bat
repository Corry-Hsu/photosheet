@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "XML_SOURCE=F:\T_XML"
if not "%~1"=="" set "XML_SOURCE=%~1"
if not exist "%XML_SOURCE%\" (
 echo Cannot find XML folder: %XML_SOURCE%
 echo Drag the XML folder onto this BAT file, or edit XML_SOURCE.
 pause
 exit /b 1
)
where py >nul 2>nul
if %errorlevel%==0 (
 set "PYTHON_CMD=py -3"
) else (
 where python >nul 2>nul
 if errorlevel 1 (
  echo Python 3 is required. Install it from https://www.python.org/downloads/
  echo Enable "Add python.exe to PATH", then run this file again.
  pause
  exit /b 1
 )
 set "PYTHON_CMD=python"
)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "RUN_STAMP=%%i"
if not defined RUN_STAMP set "RUN_STAMP=%RANDOM%-%RANDOM%"
set "OUTPUT_FOLDER=%~dp0land-area-%RUN_STAMP%"
echo Source: %XML_SOURCE%
echo Converting locally. No files are uploaded.
%PYTHON_CMD% "%~dp0build_land_area_catalog.py" "%XML_SOURCE%" "%OUTPUT_FOLDER%"
if errorlevel 1 (
 echo Conversion failed. Do not upload any partial output.
 pause
 exit /b 1
)
echo.
echo DONE. Send only the generated land-area ZIP, not the original XML folder.
explorer /select,"%OUTPUT_FOLDER%.zip"
pause
