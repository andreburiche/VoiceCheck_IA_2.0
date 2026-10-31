"""Agenda de consultas da avaliação clínica: CRUD, conflito de horário, isolamento por dono e LGPD."""

from __future__ import annotations

from urllib.parse import quote

import httpx

from tests.test_voz_clinica_api import _cliente

A = "/api/v1/voz-clinica/agenda"


def _px(nome: str) -> dict[str, str]:
    return {"X-Paciente": quote(nome)}


def test_agenda_crud_e_conflito() -> None:
    c = _cliente("agenda")
    base = {"paciente": "Paciente Agenda 1", "inicio": "2031-03-10T14:00:00-03:00", "duracao_min": 50,
            "tipo": "avaliacao", "modalidade": "presencial", "observacoes": "  Primeira consulta  "}
    r = c.post(A, json=base)
    assert r.status_code == 201, r.text
    cons = r.json()
    assert cons["inicio"].startswith("2031-03-10T17:00:00") and cons["fim"].startswith("2031-03-10T17:50:00")
    assert cons["situacao"] == "agendada" and cons["observacoes"] == "Primeira consulta"

    # sobreposição (14:30 local) é recusada, a não ser que o profissional encaixe de propósito
    outro = {**base, "paciente": "Paciente Agenda 2", "inicio": "2031-03-10T14:30:00-03:00"}
    r = c.post(A, json=outro)
    assert r.status_code == 409 and "ocupado" in r.text
    assert c.post(A, json={**outro, "permitir_conflito": True}).status_code == 201
    # logo depois do fim não é conflito
    assert c.post(A, json={**outro, "inicio": "2031-03-10T14:50:00-03:00", "paciente": "Paciente Agenda 3",
                           "permitir_conflito": False}).status_code in (201, 409)

    # intervalo e filtro por paciente
    r = c.get(A, params={"de": "2031-03-10T00:00:00-03:00", "ate": "2031-03-11T00:00:00-03:00"})
    assert r.status_code == 200 and len(r.json()["items"]) >= 2
    r = c.get(A, headers=_px("Paciente Agenda 1"))
    assert [i["id"] for i in r.json()["items"]] == [cons["id"]]

    # a próxima consulta vem com fuso (UTC); sem ele o navegador mostraria 3 h a mais
    pac = {p["paciente"]: p for p in c.get("/api/v1/voz-clinica/pacientes").json()["items"]}
    assert pac["Paciente Agenda 1"]["proxima_consulta"].startswith("2031-03-10T17:00:00")
    assert pac["Paciente Agenda 1"]["proxima_consulta"].endswith(("Z", "+00:00"))

    # remarcar e marcar como realizada
    r = c.put(f"{A}/{cons['id']}", json={**base, "inicio": "2031-03-12T09:00:00-03:00", "situacao": "realizada"})
    assert r.status_code == 200, r.text
    assert r.json()["situacao"] == "realizada" and r.json()["inicio"].startswith("2031-03-12T12:00:00")

    # a lista de pacientes mostra quem só tem agenda (sem avaliação)
    pac = {p["paciente"]: p for p in c.get("/api/v1/voz-clinica/pacientes").json()["items"]}
    assert pac["Paciente Agenda 1"]["consultas"] == 1
    assert pac["Paciente Agenda 1"]["proxima_consulta"] is None  # realizada não conta como próxima

    assert c.delete(f"{A}/{cons['id']}").status_code == 204
    assert c.delete(f"{A}/{cons['id']}").status_code == 404


def test_agenda_validacoes() -> None:
    c = _cliente("agenda")
    ok = {"paciente": "Paciente Val", "inicio": "2031-04-01T10:00:00-03:00"}
    assert c.post(A, json={**ok, "inicio": "2031-04-01T10:00:00"}).status_code == 422  # sem fuso
    assert c.post(A, json={**ok, "duracao_min": 5}).status_code == 422
    assert c.post(A, json={**ok, "tipo": "cirurgia"}).status_code == 422
    assert c.post(A, json={**ok, "extra": 1}).status_code == 422
    assert c.post(A, json={**ok, "paciente": "   "}).status_code == 422
    assert c.get(A).status_code == 400  # sem intervalo nem paciente
    assert c.get(A, params={"de": "2031-01-01T00:00:00Z", "ate": "2033-01-01T00:00:00Z"}).status_code == 400
    assert c.put(f"{A}/nao-e-uuid", json=ok).status_code == 404


def test_agenda_isolada_por_profissional_e_csrf() -> None:
    dono = _cliente("agenda")
    r = dono.post(A, json={"paciente": "Paciente Sigilo", "inicio": "2031-05-02T08:00:00-03:00"})
    assert r.status_code == 201
    cid = r.json()["id"]
    outro = _cliente("agenda_outro")
    assert outro.get(A, headers=_px("Paciente Sigilo")).json()["items"] == []
    assert outro.put(f"{A}/{cid}", json={"paciente": "X", "inicio": "2031-05-02T08:00:00-03:00"}).status_code == 404
    assert outro.delete(f"{A}/{cid}").status_code == 404
    # sem o token CSRF a escrita é recusada
    sem_csrf = httpx.Client(base_url=str(dono.base_url), cookies=dono.cookies, timeout=30)
    assert sem_csrf.delete(f"{A}/{cid}").status_code == 403
    assert dono.delete(f"{A}/{cid}").status_code == 204


def test_excluir_paciente_leva_a_agenda_e_exportar_inclui() -> None:
    c = _cliente("agenda")
    nome = "Paciente Agenda LGPD"
    assert c.post(A, json={"paciente": nome, "inicio": "2031-06-01T10:00:00-03:00"}).status_code == 201
    exp = c.get("/api/v1/voz-clinica/pacientes/exportar", headers=_px(nome))
    assert exp.status_code == 200 and len(exp.json()["consultas"]) == 1
    r = c.delete("/api/v1/voz-clinica/pacientes", headers=_px(nome))
    assert r.status_code == 200 and r.json()["consultas_excluidas"] == 1
    assert c.get(A, headers=_px(nome)).json()["items"] == []
