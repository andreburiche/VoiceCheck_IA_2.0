# Recria o container web do Estudio Musical e confirma que ele le esta pasta.
# Uso: clique duas vezes em scripts\reiniciar-web.cmd
$ErrorActionPreference = "Continue"
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz
Start-Transcript -Path (Join-Path $PSScriptRoot "reiniciar-web.log") -Force | Out-Null
Write-Host "Pasta do projeto: $raiz" -ForegroundColor Cyan

Write-Host "`n1/4 Encerrando servidores Next antigos rodando no Windows (node.exe)..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "   encerrando node.exe PID $($_.Id)"
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "`n2/4 Recriando o container web (docker compose)..." -ForegroundColor Cyan
docker compose -f infra/docker-compose.yml up -d --force-recreate --no-deps web
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nERRO: o docker compose falhou. Confira se o Docker Desktop esta aberto." -ForegroundColor Red
  Stop-Transcript | Out-Null; Read-Host "Enter para fechar"; exit 1
}

Write-Host "`n3/4 Aguardando o Next compilar (ate 4 minutos)..." -ForegroundColor Cyan
$ok = $false
# Ignora proxy do sistema para acessar o localhost
[System.Net.WebRequest]::DefaultWebProxy = $null
for ($i = 0; $i -lt 48; $i++) {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/dev-probe" -UseBasicParsing -TimeoutSec 10
    if ($r.Content -like "probe-ok*") { $ok = $true; break }
  } catch { Write-Host "   ainda compilando... ($([int](($i + 1) * 5))s)" }
}

Write-Host "`n4/4 Resultado" -ForegroundColor Cyan
docker inspect estudio-web --format "Container criado em: {{.Created}}"
docker inspect estudio-web --format "{{range .Mounts}}   {{.Source}} -> {{.Destination}}{{println}}{{end}}"
if ($ok) {
  Write-Host "`nOK: o servidor esta lendo esta pasta. Abrindo o navegador..." -ForegroundColor Green
  Start-Process "http://127.0.0.1:3000"
} else {
  Write-Host "`nATENCAO: a pagina /login nao respondeu. Copie esta janela inteira e cole no chat." -ForegroundColor Yellow
  docker compose -f infra/docker-compose.yml logs --tail 40 web
}
Stop-Transcript | Out-Null
Read-Host "`nEnter para fechar"
