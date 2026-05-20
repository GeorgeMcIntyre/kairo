@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "INPUT_DXF=%~1"
set "OUTPUT_DIR=%~2"

if "%INPUT_DXF%"=="" set "INPUT_DXF=C:\Users\georgem\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf"

if "%OUTPUT_DIR%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Convert-DxfToCadExchangerGlb.ps1" "%INPUT_DXF%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Convert-DxfToCadExchangerGlb.ps1" "%INPUT_DXF%" "%OUTPUT_DIR%"
)

echo.
pause
