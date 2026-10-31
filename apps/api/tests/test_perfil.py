"""Meu perfil: perfil profissional, acesso à avaliação clínica e foto do profissional."""

from __future__ import annotations

import os
import struct
import uuid
import zlib

import httpx
import pytest

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def _png(lado: int = 16) -> bytes:
    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    linhas = b"".join(b"\x00" + bytes([90]) * lado for _ in range(lado))
    return (b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", lado, lado, 8, 0, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(linhas)) + bloco(b"IEND", b""))


def _novo(extra: dict | None = None) -> tuple[httpx.Client, httpx.Response]:
    c = httpx.Client(base_url=BASE, timeout=60.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    email = f"perfil_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Perfil", **(extra or {})})
    if reg.status_code == 201:
        c.cookies.update(reg.cookies)
        c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    return c, reg


def test_fonoaudiologo_precisa_de_registro_no_cadastro() -> None:
    _, reg = _novo({"perfil": "fonoaudiologo"})
    assert reg.status_code == 422
    c, reg = _novo({"perfil": "fonoaudiologo", "registro": "CRFa 2-12345"})
    assert reg.status_code == 201, reg.text
    u = reg.json()["user"]
    assert u["perfil"] == "fonoaudiologo" and u["acesso_clinico"] is True
    assert u["perfil_dados"] == {"registro": "CRFa 2-12345"}
    assert c.get("/api/v1/voz-clinica/status").status_code == 200


def test_sem_perfil_clinico_nao_entra_na_avaliacao_clinica() -> None:
    c, reg = _novo({"perfil": "professor_musica"})
    assert reg.status_code == 201
    assert reg.json()["user"]["acesso_clinico"] is False
    r = c.get("/api/v1/voz-clinica/status")
    assert r.status_code == 403 and "Meu perfil" in r.text  # formato de erro padronizado da API
    assert c.get("/api/v1/voz-clinica/pacientes").status_code == 403
    # a prática em casa do paciente (link público) não depende do perfil
    assert c.get("/api/v1/pratica-casa/plano", headers={"X-Pratica-Token": "x" * 40}).status_code != 403


def test_meu_perfil_atualiza_dados_e_libera_o_acesso() -> None:
    c, _ = _novo()
    assert c.get("/api/v1/users/me").json()["perfil"] is None
    base = {"name": "Ana Fono", "perfil": "fonoaudiologo", "especialidade": "Voz", "cidade": "Recife",
            "instituicao": "Clínica Vozes", "telefone": "(81) 90000-0000", "apresentacao": "  "}
    assert c.put("/api/v1/users/me/perfil", json=base).status_code == 422  # sem registro
    r = c.put("/api/v1/users/me/perfil", json={**base, "registro": " CRFa 4-98765 "})
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["name"] == "Ana Fono" and u["acesso_clinico"] is True
    assert u["perfil_dados"] == {"registro": "CRFa 4-98765", "especialidade": "Voz", "instituicao": "Clínica Vozes",
                                 "telefone": "(81) 90000-0000", "cidade": "Recife"}
    assert c.get("/api/v1/voz-clinica/status").status_code == 200
    # trocar para professor de música tira o acesso clínico
    r = c.put("/api/v1/users/me/perfil", json={"name": "Ana", "perfil": "professor_musica"})
    assert r.json()["acesso_clinico"] is False and r.json()["perfil_dados"] is None
    assert c.get("/api/v1/voz-clinica/status").status_code == 403


def test_foto_do_profissional() -> None:
    c, _ = _novo({"perfil": "musico"})
    assert c.get("/api/v1/users/me/foto").status_code == 404
    png = _png(20)
    r = c.post("/api/v1/users/me/foto", files={"file": ("eu.png", png, "image/png")})
    assert r.status_code == 200, r.text and r.json()["tem_foto"] is True
    ver = c.get("/api/v1/users/me/foto")
    assert ver.status_code == 200 and ver.content == png and ver.headers["content-type"] == "image/png"
    assert ver.headers["cache-control"] == "private, no-store"
    assert c.post("/api/v1/users/me/foto", files={"file": ("x.png", b"GIF89a" + b"0" * 100, "image/png")}).status_code == 415
    assert c.request("DELETE", "/api/v1/users/me/foto").json()["tem_foto"] is False
    assert c.get("/api/v1/users/me/foto").status_code == 404


def test_aceite_da_politica_de_privacidade_fica_registrado() -> None:
    c, reg = _novo({"aceite_privacidade": True})
    assert reg.status_code == 201
    u = reg.json()["user"]
    assert u["privacidade_aceita_em"] and u["privacidade_versao"]
    c2, reg2 = _novo()
    assert reg2.json()["user"]["privacidade_aceita_em"] is None
    r = c2.post("/api/v1/users/me/aceite-privacidade")
    assert r.status_code == 200 and r.json()["privacidade_aceita_em"] and r.json()["privacidade_versao"]


def test_painel_de_conformidade_so_para_admin() -> None:
    c, _ = _novo()
    assert c.get("/api/v1/admin/conformidade").status_code == 403
    adm = httpx.Client(base_url=BASE, timeout=60.0)
    r = adm.post("/api/v1/auth/login", json={"email": "admin@estudio.local", "password": "senha12345"})
    if r.status_code != 200:
        pytest.skip("conta de teste do administrador indisponível")
    adm.cookies.update(r.cookies)
    m = adm.get("/api/v1/admin/conformidade")
    assert m.status_code == 200, m.text
    corpo = m.json()
    assert {"acesso", "contas", "dados_de_pacientes"} <= set(corpo)
    assert corpo["acesso"]["acessos_clinicos_registrados_7d"] >= 0
