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


_CLIENTES: dict[str, httpx.Client] = {}


def _cliente(prefixo: str) -> httpx.Client:
    """Um usuário por prefixo, reaproveitado entre os testes: o projeto limita os
    cadastros a 20 por minuto, e esta bateria passaria disso criando um por teste."""
    if prefixo not in _CLIENTES:
        _CLIENTES[prefixo] = _cliente_novo(prefixo)
    return _CLIENTES[prefixo]


def _cliente_novo(prefixo: str) -> httpx.Client:
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
    assert set(r.json()["protocolos"]) == {"idv10", "qvv", "grbasi", "easebr"}


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
    assert "WAV" in nao_wav.json()["message"]  # o projeto responde {"code", "message", "details"}

    item_ruim = client.post("/api/v1/voz-clinica/protocolos/idv10", json={"respostas": [0, 0, 9] + [0] * 7})
    assert item_ruim.status_code == 400
    assert "item 3" in item_ruim.json()["message"]

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
    assert r.json()["avaliacao_id"] is None  # sem paciente não salva
    assert r.json()["resultado"]["dsi"] == pytest.approx(4.59, abs=0.01)

    paciente = f"Dsi {uuid.uuid4().hex[:6]}"
    s = client.post("/api/v1/voz-clinica/dsi",
                    json={"tmf_s": 20, "f0_alta_hz": 600, "i_baixa_db_spl": 50, "jitter_pct": 0.5, "paciente": paciente})
    assert s.json()["avaliacao_id"]
    item = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"][0]
    assert item["tipo"] == "dsi" and item["resultado"]["entradas"]["tmf_s"] == 20
    assert client.post("/api/v1/voz-clinica/dsi", json={"tmf_s": -1, "f0_alta_hz": 600, "i_baixa_db_spl": 50, "jitter_pct": 0.5}).status_code == 422


def test_f0_da_fala_salva_com_gravacao(client: httpx.Client) -> None:
    from test_voz_clinica_fala import _frases

    paciente = f"Fala {uuid.uuid4().hex[:6]}"
    wav = para_wav(_frases())
    r = client.post("/api/v1/voz-clinica/fala", files={"file": ("fala.wav", io.BytesIO(wav), "audio/wav")},
                    data={"paciente": paciente, "tarefa": "leitura", "f0_min": "75", "f0_max": "400"})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["resultado"]["f0"]["mediana_hz"] == pytest.approx(180, rel=0.03)
    assert corpo["resultado"]["fala"]["pausas"] == 4 and corpo["audio_guardado"] is True
    item = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"][0]
    assert item["tipo"] == "fala" and item["audio"] is True
    assert client.get(f"/api/v1/voz-clinica/avaliacoes/{item['id']}/audio").content == wav

    ruim = client.post("/api/v1/voz-clinica/fala", files={"file": ("fala.wav", io.BytesIO(wav), "audio/wav")},
                       data={"tarefa": "cantar"})
    assert ruim.status_code == 400 and "Tarefa" in ruim.json()["message"]
    client.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente})


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


def test_easebr_salva_com_inversao_dos_itens_positivos(client: httpx.Client) -> None:
    paciente = f"Canto {uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/voz-clinica/protocolos/easebr", json={"respostas": [0] * 22, "paciente": paciente})
    assert r.status_code == 200, r.text
    assert r.json()["resultado"]["total"] == 9  # itens 6, 12 e 21 marcados "não" valem 3
    itens = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"]
    assert itens[0]["tipo"] == "easebr"
    assert client.post("/api/v1/voz-clinica/protocolos/easebr", json={"respostas": [0] * 10}).status_code == 400


def test_anamnese_guarda_so_campos_preenchidos(client: httpx.Client) -> None:
    paciente = f"Anamnese {uuid.uuid4().hex[:6]}"
    corpo = {"paciente": paciente, "queixa": " rouquidão ", "sintomas": ["rouquidao"], "refluxo": False, "profissao": ""}
    r = client.post("/api/v1/voz-clinica/anamnese", json=corpo)
    assert r.status_code == 200, r.text
    res = r.json()["resultado"]
    assert res == {"queixa": "rouquidão", "sintomas": ["rouquidao"], "refluxo": False}
    itens = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"]
    assert itens[0]["tipo"] == "anamnese"


@pytest.mark.parametrize("ruim", [{"paciente": ""}, {"queixa": ""}, {"sintomas": ["x"]}, {"senha": "1"}])
def test_anamnese_rejeita_entrada_invalida(client: httpx.Client, ruim: dict) -> None:
    corpo = {"paciente": "X", "queixa": "rouquidão", **ruim}
    assert client.post("/api/v1/voz-clinica/anamnese", json=corpo).status_code == 422


# ---------------------------------------------------------------------------
# Prática em casa
# ---------------------------------------------------------------------------

PLANO = {
    "exercicios": [
        {"tipo": "sustentar", "titulo": "Vogal /a/", "repeticoes": 3, "meta_s": 12},
        {"tipo": "pitch", "titulo": "Grave", "repeticoes": 2, "duracao_s": 10, "faixa_hz": {"min": 100, "max": 150}},
    ],
}


def _celular(token: str) -> httpx.Client:
    """Sem cookie e sem CSRF: só o segredo do link."""
    return httpx.Client(base_url=BASE, timeout=30.0, headers={"X-Pratica-Token": token})


def _sessao_pratica(exercicio=0, reps=None, quando=None):
    from datetime import datetime, timezone
    return {"id": str(uuid.uuid4()), "exercicio": exercicio,
            "feito_em": (quando or datetime.now(timezone.utc)).isoformat(),
            "repeticoes": reps or [{"duracao_s": 14, "fonacao_s": 13.2}]}


def test_pratica_link_sincroniza_sem_duplicar(client: httpx.Client) -> None:
    paciente = f"Casa {uuid.uuid4().hex[:6]}"
    r = client.post("/api/v1/voz-clinica/pratica", json={**PLANO, "paciente": paciente, "saudacao": "Ana"})
    assert r.status_code == 201, r.text
    criado = r.json()
    token = criado["token"]
    with _celular(token) as cel:
        plano = cel.get("/api/v1/pratica-casa/plano").json()
        assert plano["saudacao"] == "Ana" and "paciente" not in plano and len(plano["exercicios"]) == 2
        s1 = _sessao_pratica()
        s2 = _sessao_pratica(1, [{"duracao_s": 10, "fonacao_s": 8, "dentro_pct": 75, "f0_mediana_hz": 120}])
        ruim = _sessao_pratica(5)
        ruim["exercicio"] = 4  # o plano só tem 2
        r = cel.post("/api/v1/pratica-casa/sessoes", json={"sessoes": [s1, s2, ruim]})
        assert r.status_code == 200, r.text
        assert r.json()["recebidas"] == [s1["id"], s2["id"]]
        assert [x["id"] for x in r.json()["recusadas"]] == [ruim["id"]]
        # reenvio da fila (ex.: resposta perdida): não duplica
        assert cel.post("/api/v1/pratica-casa/sessoes", json={"sessoes": [s1]}).json()["recebidas"] == [s1["id"]]
        # o celular não lê o histórico
        assert cel.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).status_code == 401

    itens = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"]
    assert sorted(i["resultado"]["tipo"] for i in itens) == ["pitch", "sustentar"]
    sust = next(i for i in itens if i["resultado"]["tipo"] == "sustentar")
    assert sust["tipo"] == "pratica" and sust["resultado"]["resumo"]["melhor_s"] == 13.2
    lista = client.get("/api/v1/voz-clinica/pratica", params={"paciente": paciente}).json()["items"]
    assert lista[0]["sessoes"] == 2 and "token" not in lista[0]

    # revogado: o link para na hora
    assert client.post(f"/api/v1/voz-clinica/pratica/{criado['id']}/revogar").json()["ativo"] is False
    with _celular(token) as cel:
        assert cel.get("/api/v1/pratica-casa/plano").status_code == 410
        assert cel.post("/api/v1/pratica-casa/sessoes", json={"sessoes": [_sessao_pratica()]}).status_code == 410


def test_pratica_token_errado_e_outro_profissional(client: httpx.Client) -> None:
    with _celular("x" * 43) as cel:
        assert cel.get("/api/v1/pratica-casa/plano").status_code == 404
    with httpx.Client(base_url=BASE) as sem:
        assert sem.get("/api/v1/pratica-casa/plano").status_code == 401
    criado = client.post("/api/v1/voz-clinica/pratica", json={**PLANO, "paciente": "Outro"}).json()
    outro = _cliente("vozclin2")
    assert outro.post(f"/api/v1/voz-clinica/pratica/{criado['id']}/revogar").status_code == 404
    assert outro.get("/api/v1/voz-clinica/pratica", params={"paciente": "Outro"}).json()["items"] == []


def test_pratica_limita_links_ativos(client: httpx.Client) -> None:
    paciente = f"Limite {uuid.uuid4().hex[:6]}"
    for _ in range(3):
        assert client.post("/api/v1/voz-clinica/pratica", json={**PLANO, "paciente": paciente}).status_code == 201
    assert client.post("/api/v1/voz-clinica/pratica", json={**PLANO, "paciente": paciente}).status_code == 409


def test_pratica_teto_diario(client: httpx.Client) -> None:
    """Quem tem o link não consegue inundar o histórico: no máximo 24 sessões por dia."""
    criado = client.post("/api/v1/voz-clinica/pratica", json={**PLANO, "paciente": f"Teto {uuid.uuid4().hex[:6]}"}).json()
    with _celular(criado["token"]) as cel:
        r = cel.post("/api/v1/pratica-casa/sessoes", json={"sessoes": [_sessao_pratica() for _ in range(26)]}).json()
    assert len(r["recebidas"]) == 24
    assert len(r["recusadas"]) == 2 and "por dia" in r["recusadas"][0]["motivo"]
    lista = client.get("/api/v1/voz-clinica/pratica", params={"paciente": criado["paciente"]}).json()["items"]
    assert lista[0]["sessoes"] == 24 and lista[0]["ultima_sessao"].endswith(("Z", "+00:00"))


# ---------------------------------------------------------------------------
# LGPD: exportar e excluir todos os dados de um paciente
# ---------------------------------------------------------------------------

def test_exportar_e_excluir_paciente(client: httpx.Client) -> None:
    paciente = f"Lgpd {uuid.uuid4().hex[:6]}"
    assert client.post("/api/v1/voz-clinica/protocolos/idv10", json={"respostas": [1] * 10, "paciente": paciente}).status_code == 200
    assert client.post("/api/v1/voz-clinica/anamnese", json={"paciente": paciente, "queixa": "rouquidão"}).status_code == 200
    criado = client.post("/api/v1/voz-clinica/pratica", json={**PLANO, "paciente": paciente}).json()

    r = client.get("/api/v1/voz-clinica/pacientes/exportar", params={"paciente": paciente})
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    dados = r.json()
    assert dados["paciente"] == paciente and len(dados["avaliacoes"]) == 2 and len(dados["planos_pratica"]) == 1
    assert criado["token"] not in r.text and "token" not in dados["planos_pratica"][0]

    # outro profissional não exporta nem exclui
    outro = _cliente("vozclin3")
    assert outro.get("/api/v1/voz-clinica/pacientes/exportar", params={"paciente": paciente}).status_code == 404
    assert outro.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente}).status_code == 404

    # sem CSRF não exclui
    sem_csrf = httpx.Client(base_url=BASE, cookies=client.cookies)
    assert sem_csrf.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente}).status_code == 403

    r = client.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente})
    assert r.json() == {"avaliacoes_excluidas": 2, "planos_excluidos": 1, "gravacoes_excluidas": 0}
    assert client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"] == []
    with _celular(criado["token"]) as cel:  # o link do paciente parou junto
        assert cel.get("/api/v1/pratica-casa/plano").status_code == 404


def test_gravacao_guardada_ouvir_e_apagar(client: httpx.Client) -> None:
    """Antes/depois: a gravação da análise fica guardada, só o dono ouve, e some junto com a avaliação."""
    paciente = f"Audio {uuid.uuid4().hex[:6]}"
    wav = _wav(f0=180)
    a = client.post("/api/v1/voz-clinica/analisar", files={"file": ("v.wav", io.BytesIO(wav), "audio/wav")},
                    data={"paciente": paciente})
    assert a.status_code == 200, a.text
    assert a.json()["audio_guardado"] is True and a.json()["aviso_audio"] is None
    ident = a.json()["avaliacao_id"]

    ouvir = client.get(f"/api/v1/voz-clinica/avaliacoes/{ident}/audio")
    assert ouvir.status_code == 200
    assert ouvir.content == wav and ouvir.headers["content-type"] == "audio/wav"
    assert "no-store" in ouvir.headers["cache-control"]
    lista = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"]
    assert lista[0]["audio"] is True

    # sem guardar: a análise é salva, a gravação não
    b = client.post("/api/v1/voz-clinica/analisar", files={"file": ("v.wav", io.BytesIO(wav), "audio/wav")},
                    data={"paciente": paciente, "guardar_audio": "false"})
    assert b.json()["audio_guardado"] is False
    assert client.get(f"/api/v1/voz-clinica/avaliacoes/{b.json()['avaliacao_id']}/audio").status_code == 404

    # outro profissional não ouve; id inválido é 404
    assert _cliente("intruso").get(f"/api/v1/voz-clinica/avaliacoes/{ident}/audio").status_code == 404
    assert client.get("/api/v1/voz-clinica/avaliacoes/nao-e-uuid/audio").status_code == 404

    exportado = client.get("/api/v1/voz-clinica/pacientes/exportar", params={"paciente": paciente}).json()
    assert exportado["gravacoes_guardadas"] == 1

    # excluir a avaliação apaga a gravação; excluir o paciente informa quantas foram
    c = client.post("/api/v1/voz-clinica/analisar", files={"file": ("v.wav", io.BytesIO(wav), "audio/wav")},
                    data={"paciente": paciente}).json()
    assert client.delete(f"/api/v1/voz-clinica/avaliacoes/{ident}").status_code == 204
    assert client.get(f"/api/v1/voz-clinica/avaliacoes/{ident}/audio").status_code == 404
    r = client.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente})
    assert r.json() == {"avaliacoes_excluidas": 2, "planos_excluidos": 0, "gravacoes_excluidas": 1}
    assert client.get(f"/api/v1/voz-clinica/avaliacoes/{c['avaliacao_id']}/audio").status_code == 404


def test_ddk_salva_taxa_e_ritmo(client: httpx.Client) -> None:
    from test_voz_clinica_ddk import silabas

    paciente = f"Ddk {uuid.uuid4().hex[:6]}"
    wav = para_wav(silabas(taxa_s=6.0)[0])
    r = client.post("/api/v1/voz-clinica/ddk", files={"file": ("ddk.wav", io.BytesIO(wav), "audio/wav")},
                    data={"paciente": paciente, "tarefa": "pataka"})
    assert r.status_code == 200, r.text
    res = r.json()["resultado"]
    assert res["silabas"] == 36 and res["taxa_silabas_s"] == pytest.approx(6, rel=0.03) and res["tarefa"] == "pataka"
    item = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"][0]
    assert item["tipo"] == "ddk" and item["audio"] is True
    ruim = client.post("/api/v1/voz-clinica/ddk", files={"file": ("ddk.wav", io.BytesIO(wav), "audio/wav")}, data={"tarefa": "la"})
    assert ruim.status_code == 400
    client.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente})


def test_cepstral_vogal_e_frase(client: httpx.Client) -> None:
    from test_voz_clinica_cepstral import _frase, _vogal

    paciente = f"Cep {uuid.uuid4().hex[:6]}"
    r = client.post(
        "/api/v1/voz-clinica/cepstral",
        files={"vogal": ("v.wav", io.BytesIO(para_wav(_vogal())), "audio/wav"),
               "frase": ("f.wav", io.BytesIO(para_wav(_frase())), "audio/wav")},
        data={"paciente": paciente},
    )
    assert r.status_code == 200, r.text
    res = r.json()["resultado"]
    assert res["vogal"]["cpps_db"] > res["frase"]["cpps_db"] and res["frase"]["cpp_db"] is not None
    if res["motor"] == "praat":
        assert "valor" in res["avqi"]
    item = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"][0]
    assert item["tipo"] == "cepstral" and item["audio"] is True
    wav = client.get(f"/api/v1/voz-clinica/avaliacoes/{item['id']}/audio").content
    assert wav[:4] == b"RIFF" and len(wav) > 44100 * 2 * 4  # vogal + silêncio + frase
    sem_frase = client.post("/api/v1/voz-clinica/cepstral", files={"vogal": ("v.wav", io.BytesIO(para_wav(_vogal())), "audio/wav")})
    assert sem_frase.status_code == 422
    client.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente})


def test_anotacao_por_avaliacao(client: httpx.Client) -> None:
    paciente = f"Nota {uuid.uuid4().hex[:6]}"
    ident = client.post("/api/v1/voz-clinica/protocolos/idv10", json={"respostas": [1] * 10, "paciente": paciente}).json()["avaliacao_id"]
    r = client.put(f"/api/v1/voz-clinica/avaliacoes/{ident}/anotacao", json={"texto": "  Gravado após a aula; voz cansada.  "})
    assert r.status_code == 200, r.text
    assert r.json()["anotacao"] == "Gravado após a aula; voz cansada." and r.json()["resultado"]["total"] == 10
    item = client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"][0]
    assert item["anotacao"] == "Gravado após a aula; voz cansada."
    exportado = client.get("/api/v1/voz-clinica/pacientes/exportar", params={"paciente": paciente}).json()
    assert exportado["avaliacoes"][0]["anotacao"].startswith("Gravado")
    assert client.put(f"/api/v1/voz-clinica/avaliacoes/{ident}/anotacao", json={"texto": "  "}).json()["anotacao"] is None
    assert client.put(f"/api/v1/voz-clinica/avaliacoes/{ident}/anotacao", json={"texto": "x" * 4001}).status_code == 422
    assert _cliente("intruso").put(f"/api/v1/voz-clinica/avaliacoes/{ident}/anotacao", json={"texto": "a"}).status_code == 404
    sem_csrf = httpx.Client(base_url=BASE, cookies=client.cookies)
    assert sem_csrf.put(f"/api/v1/voz-clinica/avaliacoes/{ident}/anotacao", json={"texto": "a"}).status_code == 403
    client.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente})


def test_carga_vocal_salva_resumo(client: httpx.Client) -> None:
    paciente = f"Carga {uuid.uuid4().hex[:6]}"
    corpo = {
        "paciente": paciente, "duracao_s": 300, "duracao_planejada_s": 300, "fonacao_s": 270,
        "alvo_dbfs": {"min": -24, "max": -16}, "dentro_alvo_pct": 66.7, "f0_inicio_hz": 201, "f0_fim_hz": 224,
        "variacao_f0_st": 1.87, "db_inicio": -18.5, "db_fim": -23.6, "variacao_db": -5.1,
        "minutos": [{"minuto": i, "fonacao_pct": 90, "f0_mediana_hz": 200 + i, "db_mediano": -18 - i} for i in range(1, 6)],
    }
    r = client.post("/api/v1/voz-clinica/carga", json=corpo)
    assert r.status_code == 200, r.text
    assert r.json()["resultado"]["fonte"] == "navegador" and r.json()["avaliacao_id"]
    assert client.get("/api/v1/voz-clinica/avaliacoes", params={"paciente": paciente}).json()["items"][0]["tipo"] == "carga"
    ruim = {**corpo, "fonacao_s": 400}
    assert client.post("/api/v1/voz-clinica/carga", json=ruim).status_code == 422
    fora = {**corpo, "minutos": [{"minuto": 2, "fonacao_pct": 90}]}
    assert client.post("/api/v1/voz-clinica/carga", json=fora).status_code == 422
    client.delete("/api/v1/voz-clinica/pacientes", params={"paciente": paciente})
