"""VoiceCheck IA 2.0 — rotas /api/v1/voz-clinica contra a API no ar (pula se estiver fora)."""

from __future__ import annotations

import io
import os
import uuid

import httpx
import pytest

from voz_clinica_sintese import para_wav, sintetizar

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def _registrar(c: httpx.Client, prefixo: str) -> None:
    email = f"{prefixo}_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": prefixo})
    assert reg.status_code == 201, reg.text
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]


def _cliente(prefixo: str) -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=60.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    _registrar(c, prefixo)
    return c


@pytest.fixture
def client() -> httpx.Client:
    return _cliente("vozclin")


def _wav(**kw) -> bytes:
    return para_wav(sintetizar(**kw).audio)


def test_status_lista_motores(client: httpx.Client) -> None:
    r = client.get("/api/v1/voz-clinica/status")
    assert r.status_code == 200, r.text
    assert "interno" in r.json()["motores"]
    assert set(r.json()["protocolos"]) == {"idv10", "qvv", "grbasi"}


def test_analisar_sem_paciente_nao_salva(client: httpx.Client) -> None:
    r = client.post(
        "/api/v1/voz-clinica/analisar",
        files={"file": ("vogal.wav", io.BytesIO(_wav(f0=200, sj=0.01)), "audio/wav")},
        data={"f0_min": "100", "f0_max": "600"},
    )
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["avaliacao_id"] is None
    assert corpo["resultado"]["f0"]["media_hz"] == pytest.approx(200, rel=0.02)
    assert corpo["resultado"]["perturbacao"]["jitter_local_pct"] > 0


def test_fluxo_paciente_salva_lista_e_exclui(client: httpx.Client) -> None:
    paciente = f"Paciente {uuid.uuid4().hex[:6]}"
    a = client.post(
        "/api/v1/voz-clinica/analisar",
        files={"file": ("vogal.wav", io.BytesIO(_wav(f0=150)), "audio/wav")},
        data={"paciente": f"  {paciente}  "},  # espaços extras são removidos
    )
    assert a.status_code == 200, a.text
    assert a.json()["avaliacao_id"]

    q = client.post("/api/v1/voz-clinica/protocolos/qvv", json={"respostas": [3] * 10, "paciente": paciente})
    assert q.status_code == 200, q.text
    assert q.json()["resultado"]["total"] == 50

    lista = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"]
    assert [i["tipo"] for i in lista] == ["qvv", "acustica"]  # mais recente primeiro

    pacientes = client.get("/api/v1/voz-clinica/pacientes").json()["items"]
    assert any(p["paciente"] == paciente and p["avaliacoes"] == 2 for p in pacientes)

    d = client.delete(f"/api/v1/voz-clinica/avaliacoes/{lista[0]['id']}")
    assert d.status_code == 204
    restantes = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"]
    assert [i["tipo"] for i in restantes] == ["acustica"]


def test_outro_usuario_nao_ve_nem_exclui(client: httpx.Client) -> None:
    paciente = f"Privado {uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/voz-clinica/protocolos/idv10", json={"respostas": [1] * 10, "paciente": paciente})
    ident = r.json()["avaliacao_id"]

    intruso = _cliente("intruso")
    assert intruso.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"] == []
    assert intruso.delete(f"/api/v1/voz-clinica/avaliacoes/{ident}").status_code == 404


def test_erros_de_entrada(client: httpx.Client) -> None:
    nao_wav = client.post(
        "/api/v1/voz-clinica/analisar",
        files={"file": ("x.wav", io.BytesIO(b"isto nao e wav"), "audio/wav")},
    )
    assert nao_wav.status_code == 400
    assert "WAV" in nao_wav.json()["detail"]

    item_ruim = client.post("/api/v1/voz-clinica/protocolos/idv10", json={"respostas": [0, 0, 9] + [0] * 7})
    assert item_ruim.status_code == 400
    assert "item 3" in item_ruim.json()["detail"]

    assert client.post("/api/v1/voz-clinica/protocolos/ease", json={"respostas": []}).status_code == 404


def test_exige_login_e_csrf() -> None:
    c = httpx.Client(base_url=BASE, timeout=30.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    assert c.get("/api/v1/voz-clinica/avaliacoes").status_code == 401

    logado = _cliente("semcsrf")
    del logado.headers["X-CSRF-Token"]
    r = logado.post("/api/v1/voz-clinica/protocolos/qvv", json={"respostas": [1] * 10})
    assert r.status_code == 403


def test_dsi(client: httpx.Client) -> None:
    r = client.post(
        "/api/v1/voz-clinica/dsi",
        json={"tmf_s": 20, "f0_alta_hz": 600, "i_baixa_db_spl": 50, "jitter_pct": 0.5},
    )
    assert r.status_code == 200, r.text
    assert r.json()["dsi"] == pytest.approx(4.59, abs=0.01)


def _sessao(**extra) -> dict:
    return {
        "paciente": f"Bio {uuid.uuid4().hex[:6]}", "duracao_s": 30, "fonacao_s": 22.5,
        "alvo_pitch_hz": {"min": 180, "max": 220}, "alvo_volume_dbfs": {"min": -30, "max": -12},
        "dentro_pitch_pct": 71.2, "dentro_volume_pct": 88.0, "f0_p10_hz": 176.4, "f0_mediana_hz": 201.3,
        "f0_p90_hz": 228.0, "db_mediano": -21.0, **extra,
    }


def test_biofeedback_salva_no_historico(client: httpx.Client) -> None:
    corpo = _sessao()
    r = client.post("/api/v1/voz-clinica/biofeedback", json=corpo)
    assert r.status_code == 200, r.text
    assert r.json()["avaliacao_id"]
    assert r.json()["resultado"]["fonte"] == "navegador"
    itens = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": corpo["paciente"]}).json()["items"]
    assert [i["tipo"] for i in itens] == ["biofeedback"]
    assert itens[0]["resultado"]["dentro_pitch_pct"] == 71.2


@pytest.mark.parametrize("ruim", [
    {"alvo_pitch_hz": {"min": 220, "max": 180}},
    {"dentro_pitch_pct": 140},
    {"fonacao_s": 90},
    {"paciente": ""},
])
def test_biofeedback_rejeita_resumo_invalido(client: httpx.Client, ruim: dict) -> None:
    assert client.post("/api/v1/voz-clinica/biofeedback", json=_sessao(**ruim)).status_code == 422


def test_jogo_salva_no_historico(client: httpx.Client) -> None:
    paciente = f"Jogo {uuid.uuid4().hex[:6]}"
    corpo = {"paciente": paciente, "jogo": "sopro", "duracao_s": 25.0, "pontuacao_pct": 80.0,
             "detalhes": {"meta_s": 10.0, "melhor_s": 8.0}}
    r = client.post("/api/v1/voz-clinica/jogos", json=corpo)
    assert r.status_code == 200, r.text
    itens = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"]
    assert itens[0]["tipo"] == "jogo"
    assert itens[0]["resultado"]["detalhes"]["melhor_s"] == 8.0


@pytest.mark.parametrize("ruim", [
    {"jogo": "xadrez"},
    {"pontuacao_pct": 101},
    {"detalhes": {"meta s": 1}},
    {"detalhes": {f"k{i}": 1 for i in range(13)}},
])
def test_jogo_rejeita_resultado_invalido(client: httpx.Client, ruim: dict) -> None:
    corpo = {"paciente": "X", "jogo": "sopro", "duracao_s": 10, "pontuacao_pct": 50, "detalhes": {}, **ruim}
    assert client.post("/api/v1/voz-clinica/jogos", json=corpo).status_code == 422


def test_fonetograma_resumo_calculado_no_servidor(client: httpx.Client) -> None:
    paciente = f"Campo {uuid.uuid4().hex[:6]}"
    pontos = [{"midi": m, "min_db": -40.0, "max_db": -12.0, "tempo_s": 0.4} for m in range(67, 47, -1)]  # fora de ordem
    r = client.post("/api/v1/voz-clinica/fonetograma", json={"paciente": paciente, "duracao_s": 20, "pontos": pontos})
    assert r.status_code == 200, r.text
    res = r.json()["resultado"]
    assert res["resumo"]["extensao_st"] == 19
    assert res["pontos"][0]["midi"] == 48  # guardado em ordem
    assert res["unidade_intensidade"] == "dBFS"


@pytest.mark.parametrize("pontos", [
    [],
    [{"midi": 60, "min_db": -10, "max_db": -20, "tempo_s": 1}],
    [{"midi": 60, "min_db": -30, "max_db": -20, "tempo_s": 1}] * 2,
    [{"midi": 200, "min_db": -30, "max_db": -20, "tempo_s": 1}],
])
def test_fonetograma_rejeita_pontos_invalidos(client: httpx.Client, pontos: list) -> None:
    corpo = {"paciente": "X", "duracao_s": 10, "pontos": pontos}
    assert client.post("/api/v1/voz-clinica/fonetograma", json=corpo).status_code == 422
