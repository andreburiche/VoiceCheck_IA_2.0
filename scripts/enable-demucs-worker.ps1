# Instala Demucs+PyTorch CPU no container estudio-worker e orienta o .env.
# Uso (na raiz do repo):
#   powershell -ExecutionPolicy Bypass -File scripts/enable-demucs-worker.ps1
#
# Depois edite .env:
#   SEPARATION_ADAPTER=cpu_demucs
#   ALLOW_CONTRACT_STEMS=0
# e reinicie: docker compose -f infra/docker-compose.yml up -d worker api

$ErrorActionPreference = "Stop"
Write-Host "Instalando Demucs no estudio-worker (pode demorar vários minutos)..."
docker exec estudio-worker pip install -r /app/requirements-demucs.txt
if ($LASTEXITCODE -ne 0) {
  # Volume monta workers/audio em /app — requirements-demucs.txt está aí
  docker exec estudio-worker pip install -r requirements-demucs.txt
}
Write-Host ""
Write-Host "OK. Configure no .env e reinicie o worker:"
Write-Host "  SEPARATION_ADAPTER=cpu_demucs"
Write-Host "  ALLOW_CONTRACT_STEMS=0"
Write-Host "  docker compose -f infra/docker-compose.yml up -d worker"
Write-Host ""
Write-Host "GPU: use SEPARATION_ADAPTER=gpu_demucs com imagem CUDA + nvidia-container-toolkit."
