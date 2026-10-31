"""Exportação: tratamentos (ruído, voz, volume), corte de trecho e formatos (FFmpeg real, sem banco)."""

from __future__ import annotations

import shutil
import subprocess
import wave
from pathlib import Path

import pytest

from worker.pipeline.export_util import codificar, comando_codificar, comando_tratar, tratar

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg ausente")


def _tom(path: Path, segundos: float = 3.0) -> Path:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency=440:duration={segundos}",
                    "-f", "lavfi", "-i", f"anoisesrc=d={segundos}:a=0.02", "-filter_complex", "amix=inputs=2",
                    "-ac", "2", "-ar", "44100", str(path)], check=True)
    return path


def _duracao(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def test_tratar_corta_trecho_e_aplica_filtros(tmp_path: Path) -> None:
    from app.services.exportacao import ParametrosExportacao, filtros_ffmpeg

    src = _tom(tmp_path / "voz.wav")
    p = ParametrosExportacao(reduzir_ruido=True, realcar_voz=True, normalizar=True, inicio_s=0.5, fim_s=2.0)
    out = tratar(src, tmp_path / "t.wav", filtros_ffmpeg(p), p.inicio_s, p.fim_s)
    assert abs(_duracao(out) - 1.5) < 0.05
    # sem nada pedido, não reprocessa
    assert tratar(src, tmp_path / "x.wav", None) == src


@pytest.mark.parametrize("formato,assinatura", [("flac", b"fLaC"), ("m4a", b"ftyp"), ("ogg", b"OggS"), ("mp3", None)])
def test_codifica_nos_formatos(tmp_path: Path, formato: str, assinatura: bytes | None) -> None:
    src = _tom(tmp_path / "a.wav", 1.0)
    try:
        out = codificar(src, tmp_path / "saida", formato, "192k")
    except RuntimeError as exc:  # FFmpeg sem o codificador (ex.: sem libmp3lame/libvorbis)
        pytest.skip(str(exc)[:120])
    assert out.suffix == "." + formato and out.stat().st_size > 1000
    if assinatura:
        assert assinatura in out.read_bytes()[:64]


def test_comandos_so_com_valores_conferidos(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        comando_codificar(tmp_path / "a.wav", tmp_path / "b.exe", "exe")
    assert "192k" in comando_codificar(tmp_path / "a.wav", tmp_path / "b.mp3", "mp3", "9999k; rm")
    with pytest.raises(ValueError):
        comando_tratar(tmp_path / "a.wav", tmp_path / "b.wav", None, 5, 2)


def test_parametros_de_exportacao_recusam_o_desconhecido() -> None:
    from pydantic import ValidationError

    from app.services.exportacao import ParametrosExportacao

    for ruim in ({"format": "exe"}, {"bitrate": "1k"}, {"inicio_s": 5, "fim_s": 2}, {"filtro": "x"}, {"stem_type": "../a"}):
        with pytest.raises(ValidationError):
            ParametrosExportacao.model_validate(ruim)
    assert ParametrosExportacao.model_validate({"format": "mp3", "stem_type": "guitar"}).stem_type == "guitar"
