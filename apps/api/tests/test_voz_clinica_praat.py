"""Testes do motor Praat: rodam só onde o Parselmouth estiver instalado."""

import pytest

pytest.importorskip("parselmouth")

from app.services.voz_clinica import motor_interno, motor_praat  # noqa: E402

from voz_clinica_sintese import sintetizar  # noqa: E402

VOGAL = [(700, 80), (1200, 90), (2600, 120)]


def test_praat_calcula_todas_as_medidas_sem_avisos_de_falha():
    r = motor_praat.analisar(sintetizar(f0=150, sj=0.01, sa=0.04, ruido=0.01, formantes=VOGAL).audio)
    assert r["motor"] == "praat"
    assert not [a for a in r["avisos"] if "não calculado" in a], r["avisos"]
    assert r["f0"]["media_hz"] == pytest.approx(150, rel=0.02)
    for chave in ("jitter_local_pct", "shimmer_local_pct", "jitter_rap_pct", "shimmer_local_db"):
        assert r["perturbacao"][chave] is not None
    assert r["ruido"]["hnr_db"] is not None
    assert r["cpps_db"] is not None


def test_praat_jitter_proximo_do_sintetizado():
    voz = sintetizar(f0=150, sj=0.01)
    medido = motor_praat.analisar(voz.audio)["perturbacao"]["jitter_local_pct"]
    assert medido == pytest.approx(voz.jitter_local_pct, rel=0.2)


def test_motores_concordam_na_f0_e_nos_formantes():
    audio = sintetizar(f0=120, ruido=0.005, formantes=VOGAL).audio
    praat, interno = motor_praat.analisar(audio), motor_interno.analisar(audio)
    assert interno["f0"]["media_hz"] == pytest.approx(praat["f0"]["media_hz"], rel=0.02)
    assert interno["formantes"]["f1_hz"] == pytest.approx(praat["formantes"]["f1_hz"], rel=0.1)
    assert interno["formantes"]["f2_hz"] == pytest.approx(praat["formantes"]["f2_hz"], rel=0.1)
