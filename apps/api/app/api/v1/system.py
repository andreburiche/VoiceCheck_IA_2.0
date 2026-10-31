from __future__ import annotations

import os
import platform
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.core.database import SessionLocal
from app.models import ProcessingModel

router = APIRouter(prefix="/system", tags=["system"])
settings = get_settings()

# Catálogo de UI: só modelos com installed=True e enabled no DB podem iniciar job.
# package_size_hint_bytes = tamanho típico do pacote (não inventa medição de disco).
_MODEL_CATALOG = [
    {
        "code": "htdemucs",
        "tier": "basic",
        "label": "Básico (4 fontes)",
        "description": "Voz, bateria, baixo e outros — Demucs HTDemucs.",
        "stems": ["vocals", "drums", "bass", "other"],
        "recommended": True,
        "min_vram_mb": 4096,
        "cpu_ok": True,
        "license": "MIT",
        "package_size_hint_bytes": 80_000_000,
        "requirements": "CPU ou GPU · Demucs HTDemucs · 4 fontes",
    },
    {
        "code": "htdemucs_two",
        "tier": "instrumental",
        "label": "Vocal / Instrumental (2 fontes)",
        "description": "Voz + instrumental via Demucs htdemucs (MIT) somando drums+bass+other. Não é modelo two separado.",
        "stems": ["vocals", "instrumental"],
        "recommended": False,
        "min_vram_mb": 4096,
        "cpu_ok": True,
        "license": "MIT",
        "package_size_hint_bytes": 80_000_000,
        "requirements": "CPU ou GPU · mesmo pesos htdemucs · pós-mix FFmpeg",
    },
    {
        "code": "htdemucs_6s",
        "tier": "advanced",
        "label": "Todos os instrumentos (6 fontes)",
        "description": "Voz, bateria, baixo, guitarra, piano e outros — Demucs HTDemucs 6s. Piano é o mais difícil de isolar.",
        "stems": ["vocals", "drums", "bass", "guitar", "piano", "other"],
        "recommended": False,
        "min_vram_mb": 4096,
        "cpu_ok": True,
        "license": "MIT",
        "package_size_hint_bytes": 55_000_000,
        "requirements": "CPU ou GPU · ~30% mais lento que o de 4 fontes",
    },
    {
        "code": "htdemucs_ft",
        "tier": "advanced",
        "label": "Alta fidelidade (4 fontes)",
        "description": "Mesmas 4 faixas com o modelo afinado (fine-tuned): menos vazamento entre faixas, cerca de 4x mais lento.",
        "stems": ["vocals", "drums", "bass", "other"],
        "recommended": False,
        "min_vram_mb": 4096,
        "cpu_ok": True,
        "license": "MIT",
        "package_size_hint_bytes": 320_000_000,
        "requirements": "CPU ou GPU · 4 modelos em conjunto · bom para música que vai ser publicada",
    },
]


def _dir_size(path: Path) -> int:
    total = 0
    try:
        for p in path.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                except OSError:
                    continue
    except OSError:
        return 0
    return total


def _measure_model_disk_bytes(code: str) -> int | None:
    """Mede cache local Demucs/Torch se existir; None = não encontrado (não inventa)."""
    homes: list[Path] = []
    torch_home = os.environ.get("TORCH_HOME")
    if torch_home:
        homes.append(Path(torch_home))
    homes.append(Path.home() / ".cache" / "torch")
    homes.append(Path.home() / ".cache" / "torch" / "hub" / "checkpoints")
    needle = code.replace("_", "").lower()
    found = 0
    for root in homes:
        if not root.exists():
            continue
        try:
            for p in root.rglob("*"):
                name = p.name.lower().replace("-", "").replace("_", "")
                if needle in name and p.is_file() and p.suffix in {".th", ".pth", ".pt", ".yaml", ".bin"}:
                    try:
                        found += p.stat().st_size
                    except OSError:
                        continue
                elif p.is_dir() and needle in p.name.lower().replace("-", "").replace("_", ""):
                    found += _dir_size(p)
        except OSError:
            continue
    return found if found > 0 else None


def _disk_stats() -> dict[str, int | None]:
    root = Path(settings.local_storage_path)
    try:
        root.mkdir(parents=True, exist_ok=True)
        usage = shutil.disk_usage(root)
        return {
            "disk_total_bytes": int(usage.total),
            "disk_free_bytes": int(usage.free),
            "disk_used_bytes": int(usage.used),
        }
    except OSError:
        return {
            "disk_total_bytes": None,
            "disk_free_bytes": None,
            "disk_used_bytes": None,
        }


def _separation_models() -> list[dict]:
    adapter = settings.separation_adapter
    gpu = "gpu" in adapter.lower()
    contract = settings.allow_contract_stems and adapter == "contract"
    device = "contract" if contract else ("gpu" if gpu else "cpu")

    installed: dict[str, ProcessingModel] = {}
    db = SessionLocal()
    try:
        for row in db.scalars(select(ProcessingModel)).all():
            installed[row.code] = row
    finally:
        db.close()

    out: list[dict] = []
    for entry in _MODEL_CATALOG:
        row = installed.get(entry["code"])
        is_installed = row is not None and bool(row.is_enabled)

        if not is_installed:
            selectable = False
            reason = "Modelo não instalado neste servidor."
        elif not entry["cpu_ok"] and not gpu and not contract:
            selectable = False
            reason = f"Requer GPU (≥{entry['min_vram_mb']} MB VRAM)."
        else:
            selectable = True
            if contract:
                reason = "Instalado · adapter contract (smoke)."
            elif gpu:
                reason = "Instalado · inferência GPU."
            else:
                reason = "Instalado · inferência CPU."

        disk_bytes = _measure_model_disk_bytes(entry["code"]) if is_installed else None
        if is_installed and selectable:
            package_status = "installed"
        elif is_installed and not selectable:
            package_status = "incompatible"
        else:
            package_status = "available"

        out.append(
            {
                **entry,
                "name": row.name if row else entry["label"],
                "version": row.version if row else None,
                "license": (row.license if row else entry.get("license")) or "—",
                "installed": is_installed,
                "compatible": selectable,
                "selectable": selectable,
                "package_status": package_status,
                "reason": reason,
                "device": device,
                "disk_bytes": disk_bytes,
                "package_size_hint_bytes": entry.get("package_size_hint_bytes"),
                "requirements": entry.get("requirements") or "",
            }
        )
    return out


def _ram_total_bytes() -> int | None:
    try:
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) * 1024
    except OSError:
        pass
    if platform.system() == "Windows":
        try:
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                return int(stat.ullTotalPhys)
        except Exception:
            return None
    return None


def _probe_cuda() -> dict:
    """Probe real via nvidia-smi quando existir; não inventa GPU."""
    try:
        proc = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
        if proc.returncode != 0:
            return {
                "cuda_available": False,
                "gpu_name": None,
                "gpu_memory_total": None,
                "cuda_driver": None,
                "probe_error": (proc.stderr or proc.stdout or "nvidia-smi falhou").strip()[:240],
            }
        line = (proc.stdout or "").strip().splitlines()[0] if proc.stdout else ""
        parts = [p.strip() for p in line.split(",")]
        return {
            "cuda_available": True,
            "gpu_name": parts[0] if parts else None,
            "gpu_memory_total": parts[1] if len(parts) > 1 else None,
            "cuda_driver": parts[2] if len(parts) > 2 else None,
            "probe_error": None,
        }
    except FileNotFoundError:
        return {
            "cuda_available": False,
            "gpu_name": None,
            "gpu_memory_total": None,
            "cuda_driver": None,
            "probe_error": "nvidia-smi não encontrado",
        }
    except Exception as exc:
        return {
            "cuda_available": False,
            "gpu_name": None,
            "gpu_memory_total": None,
            "cuda_driver": None,
            "probe_error": str(exc)[:240],
        }


def _hardware_snapshot() -> dict:
    adapter = settings.separation_adapter
    cuda = _probe_cuda()
    mps = platform.system() == "Darwin"  # Metal possível; Torch MPS não verificado sem PyTorch na API
    return {
        "platform": platform.platform(),
        "arch": platform.machine(),
        "cpu_count": os.cpu_count() or 0,
        "ram_total_bytes": _ram_total_bytes(),
        "gpu_available": bool(cuda["cuda_available"]) or "gpu" in adapter.lower(),
        "cuda_available": bool(cuda["cuda_available"]),
        "mps_available": mps,
        "gpu_name": cuda.get("gpu_name"),
        "gpu_memory_total": cuda.get("gpu_memory_total"),
        "cuda_driver": cuda.get("cuda_driver"),
        "cuda_probe_error": cuda.get("probe_error"),
        "app_version": "0.1.0",
    }


@router.get("/status")
def system_status(_user: CurrentUser) -> dict:
    """Metadados de runtime (sem segredos) — honestidade na UI. Exige login.

    Nome da máquina e pasta do servidor só para administrador (ajudam a mapear o servidor num ataque)."""
    adapter = settings.separation_adapter
    contract = settings.allow_contract_stems and adapter == "contract"
    disk = _disk_stats()
    hw = _hardware_snapshot()
    return {
        "env": settings.app_env,
        "separation_adapter": adapter,
        "allow_contract_stems": settings.allow_contract_stems,
        "using_contract_silence": contract,
        "storage_backend": settings.storage_backend,
        "cpu_count": hw["cpu_count"],
        "gpu_available": hw["gpu_available"],
        "local_processing": True,
        "max_upload_bytes": settings.max_upload_bytes,
        "max_duration_seconds": max(settings.max_duration_seconds, settings.max_duration_separacao_s),
        "models": _separation_models(),
        **disk,
        **hw,
        **({"hostname": platform.node(), "storage_path": settings.local_storage_path}
           if _user.role.value == "admin" else {}),
        "message": (
            "Stems de contrato são silêncio alinhado (smoke de pipeline), não Demucs real."
            if contract
            else "Adapter de separação ativo conforme configuração do servidor."
        ),
    }


@router.get("/hardware-test")
def hardware_test(_user: CurrentUser) -> dict:
    """Teste sob demanda (nvidia-smi + snapshot). Sem efeitos colaterais."""
    disk = _disk_stats()
    hw = _hardware_snapshot()
    adapter = settings.separation_adapter
    ok = True
    notes: list[str] = [
        f"Adapter configurado: {adapter}",
        f"CPU lógica: {hw['cpu_count']}",
        f"RAM: {hw['ram_total_bytes'] or 'não medida'}",
    ]
    if hw["cuda_available"]:
        notes.append(f"CUDA OK · {hw.get('gpu_name')} · {hw.get('gpu_memory_total')}")
    else:
        notes.append(f"CUDA indisponível · {hw.get('cuda_probe_error') or 'sem GPU NVIDIA'}")
        if "gpu" in adapter.lower():
            ok = False
            notes.append("Adapter pede GPU, mas nvidia-smi falhou — verifique runtime.")
    if hw["mps_available"]:
        notes.append("Host Darwin: MPS/Metal possível no worker macOS (não verificado na API).")
    return {
        "ok": ok,
        "tested_at": datetime.now(UTC).isoformat(),
        "notes": notes,
        "hardware": hw,
        "disk": disk,
        "separation_adapter": adapter,
    }
