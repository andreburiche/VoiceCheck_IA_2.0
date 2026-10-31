from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path


@dataclass
class SeparationResult:
    stem_paths: dict[str, Path]  # vocals, drums, bass, other
    model_version: str
    adapter_name: str


class SeparationCancelled(Exception):
    """O usuário cancelou o job enquanto a inferência rodava."""


class SeparationAdapter(ABC):
    name: str

    @abstractmethod
    def separate(
        self,
        wav_path: Path,
        work_dir: Path,
        should_cancel: Callable[[], bool] | None = None,
        *,
        modelo: str = "htdemucs",
        faixas: tuple[str, ...] = ("vocals", "drums", "bass", "other"),
        shifts: int = 0,
        overlap: float = 0.25,
        timeout_s: float | None = None,
    ) -> SeparationResult:
        """should_cancel é consultado periodicamente; se retornar True a
        inferência é interrompida e SeparationCancelled é levantada.

        modelo: nome do modelo Demucs (htdemucs, htdemucs_6s, htdemucs_ft); faixas: as que ele produz.
        shifts/overlap: qualidade (mais passadas = menos artefato, mais tempo)."""
        raise NotImplementedError
