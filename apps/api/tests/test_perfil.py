"""Meu perfil: perfil profissional, acesso à avaliação clínica e foto do profissional."""

from __future__ import annotations

import os
import struct
import uuid
import zlib

import httpx
import pytest

from tests.admin_teste import admin, aprovar_fono

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
    # declarar o perfil não basta: o CRFa fica em conferência até o administrador aprovar
    assert u["perfil"] == "fonoaudiologo" and u["acesso_clinico"] is False and u["verificacao_clinica"] == "pendente"
    assert u["perfil_dados"] == {"registro": "CRFa 2-12345"}
    r = c.get("/api/v1/voz-clinica/status")
    assert r.status_code == 403 and "conferência" in r.text
    assert c.get("/api/v1/voz-clinica/pacientes").status_code == 403
    pend = admin().get("/api/v1/admin/verificacoes-clinicas").json()["items"]
    assert any(p["id"] == u["id"] and p["registro"] == "CRFa 2-12345" for p in pend)
    aprovar_fono(u["id"])
    me = c.get("/api/v1/users/me").json()
    assert me["acesso_clinico"] is True and me["verificacao_clinica"] == "aprovado"
    assert c.get("/api/v1/voz-clinica/status").status_code == 200


def test_musico_nao_entra_na_area_clinica_nem_se_declarando_fono() -> None:
    c, reg = _novo({"perfil": "musico"})
    assert reg.status_code == 201 and reg.json()["user"]["acesso_clinico"] is False
    for rota in ("/api/v1/voz-clinica/status", "/api/v1/voz-clinica/pacientes", "/api/v1/voz-clinica/avaliacoes",
                 "/api/v1/voz-clinica/agenda?de=2031-01-01T00:00:00Z&ate=2031-01-08T00:00:00Z"):
        assert c.get(rota).status_code == 403, rota
    # trocar sozinho para fonoaudiólogo em Meu perfil só pede a conferência; o acesso não abre
    r = c.put("/api/v1/users/me/perfil", json={"name": "Músico", "perfil": "fonoaudiologo", "registro": "CRFa 9-99999"})
    assert r.status_code == 200 and r.json()["acesso_clinico"] is False and r.json()["verificacao_clinica"] == "pendente"
    assert c.get("/api/v1/voz-clinica/pacientes").status_code == 403
    # recusado: continua sem acesso e vê o motivo
    aprovar_fono(r.json()["id"], aprovar=False, nota="Registro não encontrado")
    me = c.get("/api/v1/users/me").json()
    assert me["verificacao_clinica"] == "recusado" and me["verificacao_clinica_nota"] == "Registro não encontrado"
    assert "não foi aprovado" in c.get("/api/v1/voz-clinica/status").text
    # usuário comum não aprova ninguém
    assert c.post(f"/api/v1/admin/usuarios/{r.json()['id']}/verificacao-clinica", json={"aprovar": True}).status_code == 403


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
    assert u["name"] == "Ana Fono" and u["acesso_clinico"] is False and u["verificacao_clinica"] == "pendente"
    assert u["perfil_dados"] == {"registro": "CRFa 4-98765", "especialidade": "Voz", "instituicao": "Clínica Vozes",
                                 "telefone": "(81) 90000-0000", "cidade": "Recife"}
    aprovar_fono(u["id"])
    assert c.get("/api/v1/voz-clinica/status").status_code == 200
    # editar outros dados mantém a aprovação; mudar o número do registro pede nova conferência
    r = c.put("/api/v1/users/me/perfil", json={**base, "registro": "CRFa 4-98765", "cidade": "Olinda"})
    assert r.json()["acesso_clinico"] is True
    r = c.put("/api/v1/users/me/perfil", json={**base, "registro": "CRFa 4-11111"})
    assert r.json()["acesso_clinico"] is False and r.json()["verificacao_clinica"] == "pendente"
    aprovar_fono(u["id"])
    # trocar para professor de música tira o acesso clínico, e voltar para fono pede nova conferência
    r = c.put("/api/v1/users/me/perfil", json={"name": "Ana", "perfil": "professor_musica"})
    assert r.json()["acesso_clinico"] is False and r.json()["perfil_dados"] is None
    assert c.get("/api/v1/voz-clinica/status").status_code == 403
    r = c.put("/api/v1/users/me/perfil", json={**base, "registro": "CRFa 4-11111"})
    assert r.json()["acesso_clinico"] is False and r.json()["verificacao_clinica"] == "pendente"


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
    m = admin().get("/api/v1/admin/conformidade")
    assert m.status_code == 200, m.text
    corpo = m.json()
    assert {"acesso", "contas", "dados_de_pacientes"} <= set(corpo)
    assert corpo["acesso"]["acessos_clinicos_registrados_7d"] >= 0


def test_trocar_senha_logado_encerra_outros_aparelhos() -> None:
    c, reg = _novo()
    email = reg.json()["user"]["email"]
    outro = httpx.Client(base_url=BASE, timeout=60.0)
    r = outro.post("/api/v1/auth/login", json={"email": email, "password": "senha12345"})
    assert r.status_code == 200
    outro.cookies.update(r.cookies)
    import time

    time.sleep(1.2)  # o token guarda o horário em segundos
    assert c.post("/api/v1/auth/password/change", json={"senha_atual": "errada123", "nova_senha": "novaSenha123"}).status_code == 400
    r = c.post("/api/v1/auth/password/change", json={"senha_atual": "senha12345", "nova_senha": "novaSenha123"})
    assert r.status_code == 200, r.text
    c.cookies.update(r.cookies)
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    assert c.get("/api/v1/users/me").status_code == 200  # este aparelho continua
    assert outro.get("/api/v1/users/me").status_code == 401  # o outro saiu
    assert httpx.post(f"{BASE}/api/v1/auth/login", json={"email": email, "password": "novaSenha123"}).status_code == 200


def test_sair_de_todos_os_aparelhos_e_exportar_a_conta() -> None:
    c, reg = _novo({"aceite_privacidade": True})
    exp = c.get("/api/v1/users/me/exportar")
    assert exp.status_code == 200 and "attachment" in exp.headers["content-disposition"]
    corpo = exp.json()
    assert corpo["conta"]["email"] == reg.json()["user"]["email"] and corpo["conta"]["privacidade_versao"]
    assert "area_clinica" in corpo and isinstance(corpo["musicas"], list)
    import time

    time.sleep(1.2)
    r = c.post("/api/v1/auth/logout-all")
    assert r.status_code == 200
    c.cookies.clear()
    c2 = httpx.Client(base_url=BASE, timeout=60.0)
    c2.cookies.update(reg.cookies)
    assert c2.get("/api/v1/users/me").status_code == 401
