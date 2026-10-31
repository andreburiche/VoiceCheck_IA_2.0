"""IA de texto da aba Documentos: configuração, instruções e chamada aos provedores (simulados)."""

import json
from types import SimpleNamespace

import pytest

from app.services.voz_clinica import ia_texto


def _conf(**kw):
    base = {"ia_texto_provedor": "desligado", "ia_texto_modelo": "", "anthropic_api_key": "", "ollama_url": "http://ollama:11434"}
    return SimpleNamespace(**{**base, **kw})


def test_configuracao_desligada_por_padrao_e_sem_chave():
    assert ia_texto.configuracao(_conf())["disponivel"] is False
    assert ia_texto.configuracao(_conf(ia_texto_provedor="qualquer"))["disponivel"] is False
    assert ia_texto.configuracao(_conf(ia_texto_provedor="anthropic"))["disponivel"] is False  # sem chave
    c = ia_texto.configuracao(_conf(ia_texto_provedor="ANTHROPIC", anthropic_api_key="sk-teste"))
    assert c == {"disponivel": True, "provedor": "anthropic", "modelo": ia_texto.MODELO_PADRAO["anthropic"]}
    assert ia_texto.configuracao(_conf(ia_texto_provedor="ollama", ia_texto_modelo="qwen2.5"))["modelo"] == "qwen2.5"


def test_prompt_protege_dados_e_delimita_o_texto():
    system, user = ia_texto.montar_prompt("simples", "Jitter 0,99% em [PACIENTE].", "devolutiva", "  ")
    assert "Não invente" in system and "[PACIENTE]" in system and "devolutiva" in system
    assert user.startswith(ia_texto.INSTRUCAO_ACAO["simples"])
    assert "<texto>\nJitter 0,99% em [PACIENTE].\n</texto>" in user
    assert "Pedido do profissional" not in user
    _, user2 = ia_texto.montar_prompt("redigir", "", "plano", "8 sessões semanais")
    assert "Pedido do profissional: 8 sessões semanais" in user2


def test_limpar_saida():
    assert ia_texto.limpar_saida("```\nTexto pronto.\n```") == "Texto pronto."
    assert ia_texto.limpar_saida("<texto>\nOi\n</texto>") == "Oi"
    assert ia_texto.limpar_saida("   ") == ""


def test_desligada_nao_chama_nada():
    with pytest.raises(LookupError):
        ia_texto.gerar(_conf(), "melhorar", "texto", "relatorio")


def _cliente(resposta: dict, status: int = 200, guardar: list | None = None):
    import httpx

    def tratar(req: httpx.Request) -> httpx.Response:
        if guardar is not None:
            guardar.append(req)
        return httpx.Response(status, json=resposta)

    return httpx.Client(transport=httpx.MockTransport(tratar))


def test_anthropic_monta_o_pedido_e_le_a_resposta():
    pedidos: list = []
    cli = _cliente({"content": [{"type": "text", "text": "Texto melhorado para [PACIENTE]."}]}, guardar=pedidos)
    saida = ia_texto.gerar(_conf(ia_texto_provedor="anthropic", anthropic_api_key="sk-teste"),
                           "melhorar", "texto ruim de [PACIENTE]", "relatorio", cliente=cli)
    assert saida == "Texto melhorado para [PACIENTE]."
    req = pedidos[0]
    assert str(req.url) == "https://api.anthropic.com/v1/messages"
    assert req.headers["x-api-key"] == "sk-teste" and req.headers["anthropic-version"] == "2023-06-01"
    corpo = json.loads(req.content)
    assert corpo["model"] == ia_texto.MODELO_PADRAO["anthropic"] and "texto ruim de [PACIENTE]" in corpo["messages"][0]["content"]


def test_ollama_e_erros_do_provedor():
    cli = _cliente({"message": {"content": "Corrigido."}})
    assert ia_texto.gerar(_conf(ia_texto_provedor="ollama"), "corrigir", "corijido", "atestado", cliente=cli) == "Corrigido."
    with pytest.raises(RuntimeError, match="HTTP 401"):
        ia_texto.gerar(_conf(ia_texto_provedor="anthropic", anthropic_api_key="x"), "melhorar", "t", "plano",
                       cliente=_cliente({"error": {}}, status=401))
    with pytest.raises(RuntimeError, match="não devolveu texto"):
        ia_texto.gerar(_conf(ia_texto_provedor="ollama"), "melhorar", "t", "plano", cliente=_cliente({"message": {"content": " "}}))
