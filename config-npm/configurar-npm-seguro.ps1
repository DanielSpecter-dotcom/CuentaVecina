# configurar-npm-seguro.ps1
# Ejecutar UNA sola vez en cada PC del equipo, en PowerShell normal (NO como administrador):
#   powershell -ExecutionPolicy Bypass -File .\configurar-npm-seguro.ps1
# Aplica la configuración segura a nivel de usuario, así protege también "npm create" y
# cualquier proyecto, no solo CuentaVecina.

Write-Host "`n== 1. Verificando Node.js ==" -ForegroundColor Cyan
$nodeV = node -v
if ($LASTEXITCODE -ne 0) { Write-Host "Node.js no está instalado. Instala Node 24 LTS desde https://nodejs.org" -ForegroundColor Red; exit 1 }
$nodeMajor = [int]($nodeV.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { Write-Host "Tienes Node $nodeV. Necesitas Node 24 LTS o superior (https://nodejs.org)." -ForegroundColor Red; exit 1 }
Write-Host "Node $nodeV OK"

Write-Host "`n== 2. Verificando npm ==" -ForegroundColor Cyan
$npmV = [version](npm -v)
if ($npmV -lt [version]'11.10.0') {
    Write-Host "npm $npmV no reconoce min-release-age ni allow-git (los ignoraría en silencio). Actualizando npm..." -ForegroundColor Yellow
    npm install -g npm@latest --ignore-scripts
    $npmV = [version](npm -v)
    if ($npmV -lt [version]'11.10.0') { Write-Host "No se pudo actualizar npm. Abre la terminal de nuevo y reintenta." -ForegroundColor Red; exit 1 }
}
Write-Host "npm $npmV OK"

Write-Host "`n== 3. Aplicando configuración segura (usuario) ==" -ForegroundColor Cyan
npm config set ignore-scripts true --location=user
npm config set min-release-age 3 --location=user
npm config set allow-git none --location=user
npm config set audit-level high --location=user
npm config set fund false --location=user

Write-Host "`n== 4. Comprobación ==" -ForegroundColor Cyan
foreach ($k in 'ignore-scripts','min-release-age','allow-git','audit-level') {
    Write-Host ("{0,-16} = {1}" -f $k, (npm config get $k))
}

Write-Host "`n== 5. Token de npm ==" -ForegroundColor Cyan
$who = cmd /c "npm whoami 2>nul"
if ($LASTEXITCODE -eq 0 -and $who) {
    Write-Host "Tienes sesión iniciada en npm como '$who'. No la necesitas para este proyecto y es lo que roban los gusanos tipo Shai-Hulud. Ejecuta: npm logout" -ForegroundColor Yellow
} else {
    Write-Host "Sin sesión de npm (bien)."
}

Write-Host "`nListo. Configuración segura aplicada." -ForegroundColor Green
