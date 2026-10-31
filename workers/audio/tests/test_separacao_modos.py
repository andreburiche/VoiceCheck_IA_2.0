"""Modos de separação (4, 6 instrumentos, voz/acompanhamento, alta fidelidade) e qualidade (sem Demucs)."""

from __future__ import annotations

from pathlib import Path

import pytest

from worker.adapters.contract import ContractNoopAdapter
from worker.adapters.demucs_adapter import comando_demucs
from worker.pipeline.plano import plano_separacao


def test_plano_por_modelo() -> None:
    p = plano_separacao("htdemucs_6s", {}, 180_000)
    assert p["modelo"] == "htdemucs_6s"
    assert p["faixas_finais"] == ["vocals", "drums", "bass", "guitar", "piano", "other"]
    two = plano_separacao("htdemucs_two", {}, None)
    # voz + acompanhamento: o Demucs separa 4 e o worker soma bateria, baixo e outros
    assert two["two_stem"] and two["faixas_adaptador"] == ("vocals", "drums", "bass", "other")
    assert two["faixas_finais"] == ["vocals", "instrumental"]
    assert plano_separacao("htdemucs_ft", {}, None)["modelo"] == "htdemucs_ft"


def test_qualidade_e_controles_avancados() -> None:
    assert (plano_separacao("htdemucs", {}, None)["shifts"], plano_separacao("htdemucs", {}, None)["overlap"]) == (0, 0.25)
    assert plano_separacao("htdemucs", {"qualidade": "maxima"}, None)["shifts"] == 2
    p = plano_separacao("htdemucs", {"qualidade": "maxima", "shifts": 4, "overlap": 0.6}, None)
    assert (p["shifts"], p["overlap"]) == (4, 0.6)
    with pytest.raises(Exception):
        plano_separacao("htdemucs", {"shifts": 9}, None)


def test_tempo_limite_cresce_com_arquivo_longo() -> None:
    curto = plano_separacao("htdemucs", {}, 3 * 60_000)["timeout_s"]
    longo = plano_separacao("htdemucs_ft", {"qualidade": "maxima"}, 60 * 60_000)["timeout_s"]
    assert curto >= 1800 and longo > curto and longo <= 6 * 3600


def test_comando_demucs_so_aceita_valores_conferidos(tmp_path: Path) -> None:
    cmd = comando_demucs("htdemucs_6s", "cpu", tmp_path, tmp_path / "a.wav", shifts=2, overlap=0.5)
    assert cmd[:5] == ["python", "-m", "demucs", "-n", "htdemucs_6s"]
    assert "--shifts" in cmd and cmd[cmd.index("--shifts") + 1] == "2"
    assert cmd[cmd.index("--overlap") + 1] == "0.5"
    assert "--shifts" not in comando_demucs("htdemucs", "cpu", tmp_path, tmp_path / "a.wav")
    for ruim in ({"modelo": "htdemucs; rm -rf /"}, {"shifts": 6}, {"overlap": 0.9}):
        kw = {"modelo": "htdemucs", "shifts": 0, "overlap": 0.25, **ruim}
        with pytest.raises(ValueError):
            comando_demucs(kw.pop("modelo"), "cpu", tmp_path, tmp_path / "a.wav", **kw)


def test_contract_gera_as_faixas_do_modelo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import struct
    import wave

    monkeypatch.setenv("ALLOW_CONTRACT_STEMS", "1")
    monkeypatch.setenv("APP_ENV", "test")
    src = tmp_path / "mix.wav"
    with wave.open(str(src), "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(44100)
        wf.writeframes(struct.pack("<hh", 100, -100) * 4410)
    r = ContractNoopAdapter().separate(src, tmp_path / "out", modelo="htdemucs_6s",
                                       faixas=("vocals", "drums", "bass", "guitar", "piano", "other"))
    assert sorted(r.stem_paths) == sorted(["vocals", "drums", "bass", "guitar", "piano", "other"])
