import os

from worker.adapters.base import SeparationAdapter
from worker.adapters.contract import ContractNoopAdapter


def get_separation_adapter() -> SeparationAdapter:
    name = os.getenv("SEPARATION_ADAPTER", "contract").lower()
    if name == "contract":
        return ContractNoopAdapter()
    if name == "cpu_demucs":
        from worker.adapters.demucs_adapter import CpuDemucsAdapter

        return CpuDemucsAdapter()
    if name == "gpu_demucs":
        from worker.adapters.demucs_adapter import GpuDemucsAdapter

        return GpuDemucsAdapter()
    raise ValueError(f"SEPARATION_ADAPTER desconhecido: {name}")
