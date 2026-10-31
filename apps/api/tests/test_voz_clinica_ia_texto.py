"""IA de texto da aba Documentos: configuração, instruções e chamada aos provedores (simulados)."""

import json
from types import SimpleNamespace

import pytest

from app.services.voz_clinica import ia_texto


def _conf(**kw):
    base = {"ia_texto_provedor": "desligado", "ia_texto_modelo": "", "anthropic_api_key": "", "ollama_url": "http://ollama:11434",
            "ia_texto_url": "", "ia_texto_chave": "", "ia_texto_transferencia_autorizada": True}
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


def test_openai_compativel_groq_lmstudio():
    assert ia_texto.configuracao(_conf(ia_texto_provedor="openai"))["disponivel"] is False  # sem URL
    pedidos: list = []
    cli = _cliente({"choices": [{"message": {"content": "Texto simples."}}]}, guardar=pedidos)
    conf = _conf(ia_texto_provedor="openai", ia_texto_url="https://api.groq.com/openai/v1/", ia_texto_chave="gsk-teste")
    assert ia_texto.gerar(conf, "simples", "texto técnico", "devolutiva", cliente=cli) == "Texto simples."
    assert str(pedidos[0].url) == "https://api.groq.com/openai/v1/chat/completions"
    assert pedidos[0].headers["authorization"] == "Bearer gsk-teste"
    sem_chave: list = []
    ia_texto.gerar(_conf(ia_texto_provedor="openai", ia_texto_url="http://lmstudio:1234/v1"), "simples", "t", "plano",
                   cliente=_cliente({"choices": [{"message": {"content": "ok"}}]}, guardar=sem_chave))
    assert "authorization" not in sem_chave[0].headers


def test_verificar_ollama_fora_do_ar_e_sem_modelo():
    import httpx

    conf = _conf(ia_texto_provedor="ollama")

    def fora(req):
        raise httpx.ConnectError("sem rota")

    v = ia_texto.verificar(conf, cliente=httpx.Client(transport=httpx.MockTransport(fora)))
    assert v["disponivel"] is False and "não está rodando" in v["motivo"]
    v = ia_texto.verificar(conf, cliente=_cliente({"models": [{"name": "llama3.1:8b"}]}))
    assert v["disponivel"] is False and "qwen2.5:3b" in v["motivo"]
    v = ia_texto.verificar(conf, cliente=_cliente({"models": [{"name": "qwen2.5:3b"}]}))
    assert v["disponivel"] is True and v["modelo"] == "qwen2.5:3b"
    # outros provedores não fazem rede na verificação
    assert ia_texto.verificar(_conf())["disponivel"] is False


def test_provedor_externo_so_com_transferencia_autorizada():
    """LGPD art. 33: texto clínico só sai do computador com aceite explícito na configuração."""
    fora = _conf(ia_texto_provedor="anthropic", anthropic_api_key="sk", ia_texto_transferencia_autorizada=False)
    c = ia_texto.configuracao(fora)
    assert c["disponivel"] is False and "IA_TEXTO_TRANSFERENCIA_AUTORIZADA" in c["motivo"]
    groq = _conf(ia_texto_provedor="openai", ia_texto_url="https://api.groq.com/openai/v1", ia_texto_transferencia_autorizada=False)
    assert ia_texto.configuracao(groq)["disponivel"] is False
    # local continua livre: Ollama no Docker e serviço compatível em localhost/rede privada
    assert ia_texto.configuracao(_conf(ia_texto_provedor="ollama", ia_texto_transferencia_autorizada=False))["disponivel"] is True
    for url in ("http://localhost:1234/v1", "http://192.168.0.10:8080/v1", "http://host.docker.internal:1234/v1"):
        assert ia_texto.configuracao(_conf(ia_texto_provedor="openai", ia_texto_url=url,
                                           ia_texto_transferencia_autorizada=False))["disponivel"] is True


def test_anonimiza_identificadores_antes_de_enviar():
    pedidos: list = []
    cli = _cliente({"content": [{"type": "text", "text": "ok"}]}, guardar=pedidos)
    texto = "Contato (81) 99876-5432, ana@ex.com, CPF 123.456.789-09, nascida em 03/04/1980. Jitter 1,2%."
    ia_texto.gerar(_conf(ia_texto_provedor="anthropic", anthropic_api_key="sk"), "melhorar", texto, "relatorio", cliente=cli)
    enviado = json.loads(pedidos[0].content)["messages"][0]["content"]
    for dado in ("99876-5432", "ana@ex.com", "123.456.789-09", "03/04/1980"):
        assert dado not in enviado
    assert "[TELEFONE]" in enviado and "[DATA]" in enviado and "Jitter 1,2%" in enviado
    # no Ollama local a data fica (não sai do computador), o resto sai igual
    local: list = []
    ia_texto.gerar(_conf(ia_texto_provedor="ollama"), "melhorar", texto, "relatorio",
                   cliente=_cliente({"message": {"content": "ok"}}, guardar=local))
    corpo = json.loads(local[0].content)["messages"][-1]["content"]
    assert "03/04/1980" in corpo and "ana@ex.com" not in corpo
