@echo off
setlocal
rem Testes de ponta a ponta da avaliacao clinica no NAVEGADOR, contra a v2 local completa
rem (site Next + API + MySQL em Docker, os mesmos do abrir-v2-local.bat). Nao mexe no projeto original.
rem O Playwright roda num conteiner que usa a rede do site (vc2l-web); o microfone e simulado.
cd /d "%~dp0"
set "LOG=%~dp0_to_delete\teste-tela-v2.log"
echo === Testes de tela da VoiceCheck IA 2.0 - %date% %time% === > "%LOG%"

call :passo "Conferindo o Docker Desktop"
docker info >nul 2>&1 || (call :passo "ERRO: o Docker Desktop nao esta rodando. Abra-o e rode este arquivo de novo." & goto fim)

call :passo "[1/5] Subindo site, API, MySQL e Redis (a primeira vez leva alguns minutos)"
docker compose -f infra/docker-compose.v2-local.yml up -d --build >> "%LOG%" 2>&1 || goto falha

call :passo "[2/5] Esperando a API"
for /l %%i in (1,1,120) do (
  curl -s -o nul -w "%%{http_code}" http://localhost:8110/health | findstr 200 >nul && goto api_ok
  timeout /t 3 /nobreak >nul
)
goto falha
:api_ok
docker exec vc2l-api alembic upgrade head >> "%LOG%" 2>&1

call :passo "[3/5] Esperando o site compilar a pagina da avaliacao clinica"
for /l %%i in (1,1,200) do (
  curl -s -o nul -w "%%{http_code}" http://localhost:3100/login | findstr "200 307 308" >nul && goto web_ok
  timeout /t 3 /nobreak >nul
)
goto falha
:web_ok
curl -s -o nul --max-time 300 http://localhost:3100/voz-clinica >> "%LOG%" 2>&1

call :passo "[4/5] Descobrindo a versao do Playwright do projeto"
set "PWV="
for /f %%v in ('docker exec vc2l-web node -p "require('@playwright/test/package.json').version" 2^>nul') do set "PWV=%%v"
if "%PWV%"=="" (call :passo "ERRO: o @playwright/test nao esta instalado no conteiner do site" & goto falha)
echo Playwright %PWV%>> "%LOG%"

call :passo "[5/5] Rodando os testes no Chromium (Playwright %PWV%)"
docker run --rm --network container:vc2l-web -v "%CD%\apps\web:/app" -v vc2local_vc2l_node_modules:/app/node_modules -w /app -e CI=1 -e PLAYWRIGHT_BASE_URL=http://localhost:3000 mcr.microsoft.com/playwright:v%PWV%-noble node node_modules/@playwright/test/cli.js test e2e/voz-clinica.spec.ts --reporter=line --output=/tmp/pw >> "%LOG%" 2>&1
if errorlevel 1 (call :passo "RESULTADO: algum teste falhou - detalhes no log") else (call :passo "RESULTADO: todos os testes de tela passaram")
goto fim

:falha
call :passo "ERRO: um passo falhou. Veja o log: %LOG%"
docker logs --tail 60 vc2l-web >> "%LOG%" 2>&1
docker logs --tail 60 vc2l-api >> "%LOG%" 2>&1

:fim
call :passo "=== FIM === (o site continua no ar em http://localhost:3100; para parar: parar-v2-local.bat)"
echo.
echo Log completo: %LOG%
pause
exit /b

:passo
echo %~1
echo %~1>> "%LOG%"
exit /b
