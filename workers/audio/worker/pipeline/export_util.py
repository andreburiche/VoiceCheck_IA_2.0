"""Tratamento e codificação das faixas exportadas (FFmpeg): ruído, voz, volume, trecho e formato."""

from __future__ import annotations

import subprocess
from pathlib import Path

#: formato → argumentos de codificação (sem nada vindo do usuário além do bitrate já validado)
_CODEC = {
    "wav": lambda br: ["-c:a", "pcm_s16le"],
    "flac": lambda br: ["-c:a", "flac", "-compression_level", "5"],
    "mp3": lambda br: ["-c:a", "libmp3lame", "-b:a", br],
    "m4a": lambda br: ["-c:a", "aac", "-b:a", br, "-movflags", "+faststart"],
    "ogg": lambda br: ["-c:a", "libvorbis", "-b:a", br],
}
BITRATES = {"128k", "192k", "256k", "320k"}


def comando_tratar(entrada: Path, saida: Path, filtros: str | None, inicio_s: float | None, fim_s: float | None) -> list[str]:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if inicio_s:
        cmd += ["-ss", f"{float(inicio_s):.3f}"]
    cmd += ["-i", str(entrada)]
    if fim_s:
        dur = float(fim_s) - float(inicio_s or 0)
        if dur <= 0:
            raise ValueError("Trecho vazio")
        cmd += ["-t", f"{dur:.3f}"]
    if filtros:
        cmd += ["-af", filtros]
    return cmd + ["-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(saida)]


def comando_codificar(entrada: Path, saida: Path, formato: str, bitrate: str = "192k") -> list[str]:
    if formato not in _CODEC:
        raise ValueError(f"Formato não suportado: {formato}")
    if bitrate not in BITRATES:
        bitrate = "192k"
    return ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(entrada), *_CODEC[formato](bitrate), str(saida)]


def _rodar(cmd: list[str], o_que: str) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if r.returncode != 0:
        raise RuntimeError(f"{o_que} falhou: {(r.stderr or r.stdout)[-800:]}")


def tratar(entrada: Path, saida: Path, filtros: str | None, inicio_s: float | None = None, fim_s: float | None = None) -> Path:
    """Aplica filtros e corte; sem nada pedido, devolve a própria entrada (sem reprocessar)."""
    if not filtros and not inicio_s and not fim_s:
        return entrada
    _rodar(comando_tratar(entrada, saida, filtros, inicio_s, fim_s), "Tratamento do áudio")
    return saida


def codificar(entrada: Path, saida_sem_ext: Path, formato: str, bitrate: str = "192k") -> Path:
    destino = saida_sem_ext.with_suffix("." + formato)
    if formato == "wav" and entrada.suffix == ".wav":
        if entrada != destino:
            destino.write_bytes(entrada.read_bytes())
        return destino
    _rodar(comando_codificar(entrada, destino, formato, bitrate), f"Codificação {formato.upper()}")
    return destino
