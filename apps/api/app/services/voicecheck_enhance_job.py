"""Execução de um job "Aprimorar com IA" (usado pelo worker e, sem fila, pela API).

Estado do job fica em <pasta do job>/meta.json:
    state: queued | running | done | failed
    stage: texto para a tela; progress: 0..100
    stats / warnings / error
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable

import numpy as np

from app.services.voicecheck_autotune import _write_wav
from app.services.voicecheck_enhance import EnhanceOptions, enhance_pipeline
from app.services.voicecheck_pitch import load_wav_bytes, load_wav_mono

logger = logging.getLogger(__name__)

#: Recebe (wav de entrada, pasta de trabalho) e devolve o WAV só da voz (mono 16-bit).
IsolateFn = Callable[[Path, Path], Path]


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def read_job(work: Path) -> dict[str, Any] | None:
    p = work / "meta.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


_LOCK = threading.Lock()


def update_job(work: Path, **fields: Any) -> dict[str, Any]:
    """Lê-modifica-grava o meta.json de forma atômica (arquivo temporário único)."""
    with _LOCK:
        meta = read_job(work) or {}
        meta.update(fields)
        meta["updated_at"] = now_iso()
        tmp = work / f"meta.{uuid.uuid4().hex}.tmp"
        tmp.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, work / "meta.json")
        return meta


def _match_length(v: np.ndarray, n: int) -> np.ndarray:
    if v.size >= n:
        return v[:n]
    return np.pad(v, (0, n - v.size))


def _vocals(work: Path, samples: np.ndarray, sr: int, isolate_fn: IsolateFn) -> np.ndarray:
    vocals_path = isolate_fn(work / "input.wav", work)
    v, vsr = load_wav_mono(vocals_path)
    if vsr != sr:
        idx = np.arange(int(round(v.size * sr / vsr))) * (vsr / sr)
        v = np.interp(idx, np.arange(v.size), v).astype(np.float32)
    return _match_length(v.astype(np.float32), samples.size)


def _isolate_only(work: Path, samples: np.ndarray, sr: int, isolate_fn: IsolateFn | None) -> None:
    """Só a voz, sem nenhum outro processamento — é o que a análise vai medir."""
    if isolate_fn is None:
        update_job(
            work,
            state="failed",
            stage="Falhou",
            error="Separação por IA indisponível agora (worker fora do ar).",
        )
        return
    update_job(work, stage="Separando a voz dos instrumentos com IA (Demucs)", progress=10)
    v = _vocals(work, samples, sr, isolate_fn)
    mix_rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2))) if samples.size else 0.0
    voc_rms = float(np.sqrt(np.mean(v.astype(np.float64) ** 2))) if v.size else 0.0
    ratio = voc_rms / mix_rms if mix_rms > 0 else 0.0
    warnings: list[str] = []
    if ratio < 0.05:
        warnings.append("Quase não encontramos voz nesta gravação — confira se há canto no áudio.")
    update_job(work, stage="Finalizando", progress=96)
    peak = float(np.max(np.abs(v))) if v.size else 0.0
    if peak > 0.999:
        v = v * (0.999 / peak)
    (work / "output.wav").write_bytes(_write_wav(v, sr))
    stats = {
        "isolated": True,
        "mode": "isolate",
        "voice_ratio": round(ratio, 3),
        "model": os.getenv("DEMUCS_MODEL", "htdemucs"),
        "warnings": warnings,
    }
    update_job(work, state="done", stage="Pronto", progress=100, stats=stats, warnings=warnings, finished_at=now_iso())


def run_enhance_job(work: Path, isolate_fn: IsolateFn | None) -> None:
    if read_job(work) is None:
        return  # job apagado antes de começar
    try:
        opts = EnhanceOptions.from_dict(json.loads((work / "options.json").read_text(encoding="utf-8")))
        update_job(work, state="running", stage="Preparando o áudio", progress=5, started_at=now_iso())
        samples, sr = load_wav_bytes((work / "input.wav").read_bytes())
        warnings: list[str] = []
        isolated = False
        src = samples
        if opts.mode == "isolate":
            _isolate_only(work, samples, sr, isolate_fn)
            return
        if opts.isolate:
            if isolate_fn is None:
                warnings.append(
                    "Separação por IA indisponível agora (worker fora do ar) — "
                    "o aprimoramento usou a gravação inteira, com instrumentos."
                )
            else:
                update_job(work, stage="Separando a voz dos instrumentos com IA (Demucs)", progress=10)
                try:
                    src = _vocals(work, samples, sr, isolate_fn)
                    isolated = True
                except Exception as exc:  # noqa: BLE001
                    logger.warning("VoiceCheck enhance: isolamento falhou: %s", exc)
                    warnings.append(
                        f"A separação da voz falhou ({str(exc)[:120]}) — usamos a gravação inteira."
                    )

        def progress(stage: str, pct: int) -> None:
            update_job(work, stage=stage, progress=pct)

        out, stats = enhance_pipeline(src, sr, opts, isolated=isolated, progress=progress)
        update_job(work, stage="Finalizando", progress=96)
        (work / "output.wav").write_bytes(_write_wav(out, sr))
        stats["warnings"] = warnings
        update_job(
            work,
            state="done",
            stage="Pronto",
            progress=100,
            stats=stats,
            warnings=warnings,
            finished_at=now_iso(),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("VoiceCheck enhance falhou em %s", work)
        if read_job(work) is not None:
            update_job(work, state="failed", stage="Falhou", error=str(exc)[:300] or "Falha no aprimoramento")
