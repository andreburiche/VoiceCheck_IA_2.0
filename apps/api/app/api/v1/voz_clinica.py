"""VoiceCheck IA 2.0 — avaliação clínica da voz.

Análise acústica (F0, jitter, shimmer, HNR, CPPS, formantes, tempo de fonação),
protocolos de autoavaliação (IDV-10, QVV, EASE-BR), escala perceptiva (GRBASI),
anamnese vocal, DSI e planos de prática em casa (link para o celular do paciente).
Todo número é calculado aqui no servidor; quando um paciente é informado, o
resultado fica salvo para acompanhar a evolução entre sessões.
"""

from __future__ import annotations

import asyncio
import math
import hashlib
import hmac
import unicodedata
import logging
import uuid
from urllib.parse import unquote
from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import JSONResponse, Response, StreamingResponse
from sqlalchemy import delete, func, select

from app.api.v1.voicecheck import _read_limited
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.api.v1.pratica_casa import plano_out, sessoes_por_plano
from app.models import ClinicalEvaluation, HomePracticePlan, User, VoicePatient
from app.schemas.voz_clinica import (
    AnamneseEntrada,
    AnotacaoEntrada,
    AvaliacaoLista,
    BiofeedbackEntrada,
    CadastroEntrada,
    CadastroOut,
    CargaEntrada,
    EggEntrada,
    NasalanciaEntrada,
    TipoAvaliacao,
    SessaoEntrada,
    FonetogramaEntrada,
    JogoEntrada,
    AvaliacaoOut,
    DsiEntrada,
    PacienteLista,
    PacienteResumo,
    PlanoCriado,
    PlanoEntrada,
    PlanoLista,
    PlanoOut,
    ProtocoloEntrada,
    ResultadoSalvo,
    StatusOut,
)
from app.services import voz_clinica
from app.services.voz_clinica.audio import limitar_duracao
from app.services.voz_clinica.cepstral import analisar_cepstral
from app.services.voz_clinica.ddk import analisar_ddk
from app.services.voz_clinica import manipulacao, midias
from app.services.voz_clinica.exclusao import apagar_ou_agendar, tentar_pendentes
from app.services.voz_clinica.fala import analisar_fala
from app.services.voz_clinica.fonetograma import resumir_campo, resumo_em_spl
from app.services.voz_clinica.indices import dsi
from app.services.audit import write_audit
from app.services.quotas import QuotaExceeded, assert_can_upload
from app.services.storage import get_storage
from app.services.voz_clinica.pratica import hash_token, novo_token
from app.services.voz_clinica.protocolos import PROTOCOLOS, ErroProtocolo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voz-clinica", tags=["voz-clinica"])
settings = get_settings()

#: Gravação de vogal sustentada ou fala curta: 30 MB cobre ~5 min de WAV 48 kHz.
MAX_WAV_BYTES = 30 * 1024 * 1024


def _paciente(valor: str | None) -> str | None:
    if valor is None:
        return None
    # NFC: "Lúcia" digitado em sistemas diferentes vira os mesmos bytes (o banco compara bytes)
    valor = unicodedata.normalize("NFC", " ".join(valor.split()))
    if len(valor) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome do paciente com mais de 120 caracteres")
    return valor or None


def _paciente_consulta(
    paciente: str | None = Query(default=None, description="Obsoleto: prefira o cabeçalho X-Paciente"),
    x_paciente: str | None = Header(default=None, alias="X-Paciente",
                                    description="Nome do paciente codificado como em encodeURIComponent"),
) -> str | None:
    """Nome do paciente nas consultas (GET/DELETE). O navegador manda no cabeçalho X-Paciente, e não
    na URL: endereços vão parar em logs de proxies, servidores web e monitoramento (LGPD). A query
    `?paciente=` continua aceita por compatibilidade."""
    if x_paciente is not None:
        try:
            return unquote(x_paciente, errors="strict")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cabeçalho X-Paciente inválido") from exc
    return paciente


PacienteConsulta = Annotated[str | None, Depends(_paciente_consulta)]


def _salvar(db: DbSession, user: CurrentUser, paciente: str | None, tipo: str,
            resultado: dict, motor: str | None = None) -> str | None:
    if paciente is None:
        return None
    row = ClinicalEvaluation(owner_id=user.id, patient_name=paciente, kind=tipo, engine=motor, result=resultado)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id


def _com_spl(resultado: dict, calibracao, valores_dbfs: dict) -> None:
    """Com o microfone calibrado (decibelímetro), guarda a calibração e os mesmos valores em dB SPL
    (dB SPL = dBFS + deslocamento). Os campos originais continuam em dBFS."""
    if calibracao is None:
        return
    d = calibracao.deslocamento_db
    resultado["calibracao"] = calibracao.model_dump(mode="json")
    resultado["spl"] = {k: (None if v is None else round(v + d, 1)) for k, v in valores_dbfs.items()}


def _saida(row: ClinicalEvaluation) -> AvaliacaoOut:
    return AvaliacaoOut(
        id=row.id, paciente=row.patient_name, tipo=row.kind, motor=row.engine,
        resultado=row.result, criado_em=row.created_at, audio=row.audio_key is not None, anotacao=row.notes,
    )


def _apagar_audios(db: DbSession, chaves: list[str]) -> None:
    """Depois do commit: apaga as gravações no storage; as que falharem ficam agendadas para nova
    tentativa (services/voz_clinica/exclusao.py), que também aproveita para apagar pendências antigas."""
    chaves = [c for c in chaves if c]
    if chaves:
        apagar_ou_agendar(db, chaves)
    tentar_pendentes(db, limite=20)


@router.get("/status", response_model=StatusOut)
def status_servico(user: CurrentUser) -> StatusOut:
    return StatusOut(motores=voz_clinica.motores_disponiveis(), protocolos=list(PROTOCOLOS))


@router.post("/analisar", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
async def analisar(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    f0_min: float = Form(75.0),
    f0_max: float = Form(600.0),
    motor: str = Form("auto"),
    paciente: str | None = Form(None),
    guardar_audio: bool = Form(True),
) -> ResultadoSalvo:
    """Recebe um WAV sem compressão (vogal sustentada) e devolve as medidas acústicas.

    Com paciente informado, a análise é salva e (salvo `guardar_audio=false`) a gravação
    também, para ouvir de novo e comparar sessões. O áudio conta na cota de armazenamento;
    se a cota estiver cheia ou o storage falhar, a análise é salva assim mesmo, sem o áudio.
    """
    enforce_rate_limit(
        request,
        bucket="voz_clinica",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    nome = _paciente(paciente)
    dados = await _read_limited(file, MAX_WAV_BYTES)
    def _rodar() -> dict:
        audio = limitar_duracao(voz_clinica.ler_wav(dados), 60)
        return voz_clinica.analisar(audio, motor=motor, f0_min=f0_min, f0_max=f0_max)

    try:
        # cálculo pesado em thread, para não travar as outras requisições
        resultado = await asyncio.to_thread(_rodar)
    except (voz_clinica.ErroAudio, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — falha inesperada do motor
        logger.exception("Voz clínica: falha na análise")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível analisar a gravação") from exc

    if nome is None or "f0" not in resultado:
        return ResultadoSalvo(avaliacao_id=None, resultado=resultado)
    return await _salvar_com_audio(db, user, nome, "acustica", resultado, dados, guardar_audio)


async def _salvar_com_audio(db: DbSession, user: CurrentUser, nome: str, tipo: str, resultado: dict,
                            dados: bytes, guardar_audio: bool) -> ResultadoSalvo:
    """Salva a avaliação e, se pedido e houver cota, a gravação no storage.

    A análise é gravada primeiro (commit próprio): cota cheia, storage fora do ar ou falha ao
    ligar o áudio nunca a perdem. A gravação vem numa segunda transação que trava a linha do
    usuário antes de conferir a cota, para que dois envios simultâneos não passem do limite.
    """
    uid = user.id  # lido antes do commit: depois dele, ler user.id abriria o snapshot antes da trava
    row = ClinicalEvaluation(owner_id=uid, patient_name=nome, kind=tipo, engine=resultado.get("motor"), result=resultado)
    db.add(row)
    db.flush()
    row_id = row.id
    db.commit()
    aviso = None
    guardado = False
    if guardar_audio:
        aviso, guardado = await _guardar_audio(db, uid, row_id, dados)
    return ResultadoSalvo(avaliacao_id=row_id, resultado=resultado, audio_guardado=guardado, aviso_audio=aviso)


def _travar_cota(db: DbSession, user_id: str) -> None:
    """Primeiro comando da transação: SELECT ... FOR UPDATE na linha do usuário.

    No InnoDB a leitura consistente (snapshot) só começa no primeiro SELECT comum; travando
    antes, a soma da cota já enxerga o que outro envio do mesmo usuário acabou de gravar.
    No SQLite o FOR UPDATE é ignorado (a escrita já é serializada pelo próprio banco).
    """
    db.execute(select(User.id).where(User.id == user_id).with_for_update())


def _reservar_audio(db: DbSession, user_id: str, row_id: str, chave: str, tamanho: int) -> bool:
    """Transação curta, sem nenhum await no meio: trava a linha do usuário, confere a cota e já
    marca os bytes na avaliação (a reserva passa a contar na cota). A trava é solta no commit,
    antes do envio ao storage; assim um upload lento nunca segura a trava nem trava o worker.
    Devolve False se a avaliação já não existe (excluída nesse meio-tempo)."""
    try:
        _travar_cota(db, user_id)
        assert_can_upload(db, user_id, tamanho)
        feito = db.execute(
            ClinicalEvaluation.__table__.update()
            .where(ClinicalEvaluation.id == row_id, ClinicalEvaluation.owner_id == user_id)
            .values(audio_key=chave, audio_bytes=tamanho)
        )
        if feito.rowcount != 1:
            db.rollback()
            return False
        db.commit()
        return True
    except BaseException:
        db.rollback()
        raise


def _desfazer_reserva(db: DbSession, row_id: str, chave: str) -> None:
    try:
        db.execute(
            ClinicalEvaluation.__table__.update()
            .where(ClinicalEvaluation.id == row_id, ClinicalEvaluation.audio_key == chave)
            .values(audio_key=None, audio_bytes=None)
        )
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("Voz clínica: falha ao desfazer a reserva da gravação")


def _ainda_ligado(db: DbSession, row_id: str, chave: str) -> bool:
    """Depois do envio: a avaliação ainda aponta para o arquivo? (pode ter sido excluída durante o upload)"""
    achou = db.scalar(select(ClinicalEvaluation.id).where(ClinicalEvaluation.id == row_id,
                                                          ClinicalEvaluation.audio_key == chave))
    db.commit()
    return achou is not None


async def _guardar_audio(db: DbSession, user_id: str, row_id: str, dados: bytes) -> tuple[str | None, bool]:
    chave = f"voz-clinica/{user_id}/{row_id}.wav"
    try:
        if not _reservar_audio(db, user_id, row_id, chave, len(dados)):
            return "A avaliação foi excluída antes de a gravação ser guardada.", False
    except QuotaExceeded as exc:
        return f"{exc.message}. A análise foi salva sem a gravação.", False
    except Exception:  # noqa: BLE001 — banco fora do ar não pode perder a análise
        logger.exception("Voz clínica: falha ao reservar a gravação")
        return "Não foi possível guardar a gravação; a análise foi salva sem ela.", False
    try:
        await asyncio.to_thread(get_storage().put_bytes, chave, dados, "audio/wav")
    except Exception:  # noqa: BLE001 — storage fora do ar
        logger.exception("Voz clínica: falha ao guardar a gravação")
        _desfazer_reserva(db, row_id, chave)
        await asyncio.to_thread(_apagar_audios, db, [chave])  # envio parcial não pode ficar sem dono
        return "Não foi possível guardar a gravação; a análise foi salva sem ela.", False
    if not _ainda_ligado(db, row_id, chave):
        await asyncio.to_thread(_apagar_audios, db, [chave])
        return "A avaliação foi excluída antes de a gravação ser guardada.", False
    return None, True


LOTE_MAX_ARQUIVOS = 20
#: 60 s de WAV estéreo 24 bits a 48 kHz ≈ 17 MB; o lote só analisa os primeiros 60 s de cada arquivo.
LOTE_MAX_BYTES = 20 * 1024 * 1024
#: Uploads grandes (lote, mídias) lidos ao mesmo tempo neste worker: limita o pico de memória.
_MEMORIA_PESADA = asyncio.Semaphore(2)


@router.post("/analisar-lote", dependencies=[Depends(verify_csrf)])
async def analisar_lote(
    request: Request,
    user: CurrentUser,
    files: list[UploadFile] = File(...),
    f0_min: float = Form(75.0),
    f0_max: float = Form(600.0),
    motor: str = Form("auto"),
) -> dict:
    """Várias gravações de uma vez (como um script de análise do Praat): uma linha de medidas
    por arquivo. Nada é salvo no prontuário. Um arquivo com problema não derruba os outros."""
    enforce_rate_limit(request, bucket="voz_clinica_lote", limit=6, window_sec=600)
    if not files or len(files) > LOTE_MAX_ARQUIVOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Envie de 1 a {LOTE_MAX_ARQUIVOS} arquivos WAV")

    def _um(dados: bytes) -> dict:
        audio = limitar_duracao(voz_clinica.ler_wav(dados), 60)
        r = voz_clinica.analisar(audio, motor=motor, f0_min=f0_min, f0_max=f0_max)
        r.pop("graficos", None)  # a tabela não precisa das curvas (deixa a resposta leve)
        return r

    itens = []
    # um arquivo por vez: lê, analisa e descarta (o lote inteiro nunca fica na memória)
    for i, arquivo in enumerate(files):
        nome = arquivo.filename or f"arquivo {i + 1}"
        try:
            async with _MEMORIA_PESADA:
                dados = await _read_limited(arquivo, LOTE_MAX_BYTES)
                res = await asyncio.to_thread(_um, dados)
                del dados
            itens.append({"arquivo": nome[:200], "ok": True, "resultado": res})
        except HTTPException as exc:
            itens.append({"arquivo": nome[:200], "ok": False, "erro": "Arquivo grande demais (até 20 MB por arquivo no lote)"
                          if exc.status_code == 413 else str(exc.detail)})
        except (voz_clinica.ErroAudio, ValueError) as exc:
            itens.append({"arquivo": nome[:200], "ok": False, "erro": str(exc)})
        except Exception:  # noqa: BLE001
            logger.exception("Voz clínica: falha na análise em lote")
            itens.append({"arquivo": nome[:200], "ok": False, "erro": "Não foi possível analisar este arquivo"})
    return {"itens": itens}


@router.post("/manipular", dependencies=[Depends(verify_csrf)])
async def manipular_gravacao(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(...),
    semitons: float = Form(0.0),
    fator_duracao: float = Form(1.0),
    f0_min: float = Form(75.0),
    f0_max: float = Form(600.0),
) -> Response:
    """Devolve a gravação com a F0 deslocada e/ou a duração mudada (PSOLA do Praat), em WAV.
    Nada é salvo."""
    enforce_rate_limit(request, bucket="voz_clinica_manip", limit=20, window_sec=600)
    if not manipulacao.disponivel():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="A manipulação de pitch e duração precisa do Praat instalado no servidor")
    if not (math.isfinite(f0_min) and math.isfinite(f0_max) and 30 <= f0_min < f0_max <= 1200):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Faixa de F0 inválida (30 a 1200 Hz, mínimo menor que o máximo)")
    dados = await _read_limited(file, MAX_WAV_BYTES)

    def _rodar() -> bytes:
        audio = limitar_duracao(voz_clinica.ler_wav(dados), 60)
        return manipulacao.para_wav(manipulacao.manipular(audio, semitons, fator_duracao, f0_min, f0_max))

    try:
        wav = await asyncio.to_thread(_rodar)
    except (voz_clinica.ErroAudio, ValueError) as exc:  # ErroManipulacao é ValueError
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Voz clínica: falha na manipulação")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível manipular a gravação") from exc
    return Response(wav, media_type="audio/wav", headers={"Cache-Control": "private, no-store",
                                                          "Content-Disposition": 'inline; filename="voicecheck-manipulada.wav"'})


@router.post("/fala", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
async def analisar_fala_rota(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    f0_min: float = Form(75.0),
    f0_max: float = Form(500.0),
    tarefa: str = Form("leitura"),
    motor: str = Form("auto"),
    paciente: str | None = Form(None),
    guardar_audio: bool = Form(True),
) -> ResultadoSalvo:
    """F0 da fala: leitura, contagem ou fala espontânea (WAV), para o protocolo de voz."""
    enforce_rate_limit(
        request,
        bucket="voz_clinica",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    nome = _paciente(paciente)
    dados = await _read_limited(file, MAX_WAV_BYTES)

    def _rodar() -> dict:
        return analisar_fala(limitar_duracao(voz_clinica.ler_wav(dados), 120), motor=motor, f0_min=f0_min, f0_max=f0_max, tarefa=tarefa)

    try:
        resultado = await asyncio.to_thread(_rodar)
    except (voz_clinica.ErroAudio, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Voz clínica: falha na análise da fala")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível analisar a gravação") from exc
    if nome is None or "f0" not in resultado:
        return ResultadoSalvo(avaliacao_id=None, resultado=resultado)
    return await _salvar_com_audio(db, user, nome, "fala", resultado, dados, guardar_audio)


@router.post("/protocolos/{nome}", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def calcular_protocolo(nome: str, entrada: ProtocoloEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    funcao = PROTOCOLOS.get(nome.lower())
    if funcao is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Protocolo desconhecido: use {', '.join(PROTOCOLOS)}")
    try:
        resultado = funcao(entrada.respostas)
    except ErroProtocolo as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    salvo = _salvar(db, user, _paciente(entrada.paciente), nome.lower(), resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/biofeedback", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_biofeedback(entrada: BiofeedbackEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda o resumo de uma sessão de biofeedback no histórico do paciente."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar a sessão")
    resultado = {**entrada.model_dump(mode="json", exclude={"paciente", "calibracao"}), "fonte": "navegador"}
    _com_spl(resultado, entrada.calibracao, {
        "db_mediano": resultado["db_mediano"],
        "alvo_min": resultado["alvo_volume_dbfs"]["min"], "alvo_max": resultado["alvo_volume_dbfs"]["max"],
    })
    salvo = _salvar(db, user, nome, "biofeedback", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/sessoes", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def registrar_sessao(entrada: SessaoEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Registro de uma sessão de terapia (evolução clínica): data, objetivos, exercícios,
    resposta do paciente, orientações e observações. O número da sessão é contado por paciente."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente da sessão")
    hoje = datetime.now(timezone.utc).date()
    if not (date(1900, 1, 1) <= entrada.data <= hoje + timedelta(days=1)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data da sessão inválida (no futuro?)")
    campos = {k: (getattr(entrada, k) or "").strip() or None
              for k in ("objetivos", "exercicios", "resposta", "orientacoes", "observacoes")}
    if not any(campos.values()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Preencha ao menos um campo da sessão")
    uid = user.id
    db.rollback()  # a trava tem de ser o primeiro comando da transação (ver _travar_cota)
    _travar_cota(db, uid)  # serializa dois registros simultâneos do mesmo usuário
    numeros = db.scalars(
        select(ClinicalEvaluation.result).where(
            ClinicalEvaluation.owner_id == uid, ClinicalEvaluation.patient_name == nome, ClinicalEvaluation.kind == "sessao"
        )
    ).all()
    # o maior número já usado (não a contagem): excluir a sessão 2 de 1-2-3 não faz a próxima repetir o 3
    ultimo = max((int(r["numero"]) for r in numeros if isinstance(r, dict) and isinstance(r.get("numero"), int)), default=0)
    resultado = {
        "numero": ultimo + 1,
        "data": entrada.data.isoformat(),
        **campos,
        "exercicios_lista": [l.strip() for l in (campos["exercicios"] or "").splitlines() if l.strip()][:30],
    }
    row = ClinicalEvaluation(owner_id=uid, patient_name=nome, kind="sessao", engine=None, result=resultado)
    db.add(row)
    db.flush()
    salvo = row.id
    db.commit()
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/nasalancia", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_nasalancia(entrada: NasalanciaEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Nasalância (Nasometer/lingWAVES) medida no navegador com dois microfones (oral e nasal)."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente")
    if entrada.mediana_pct > 100 or entrada.dp_pct > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valores de nasalância inválidos")
    resultado = {**entrada.model_dump(exclude={"paciente"}), "observacao": (entrada.observacao or "").strip() or None}
    salvo = _salvar(db, user, nome, "nasalancia", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/egg", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_egg(entrada: EggEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Eletroglotografia (lingWAVES): quociente de contato medido no navegador a partir do sinal do EGG."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente")
    resultado = entrada.model_dump(exclude={"paciente"})
    salvo = _salvar(db, user, nome, "egg", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/carga", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_carga(entrada: CargaEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda o resumo do teste de carga vocal no histórico do paciente."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar o teste")
    resultado = {**entrada.model_dump(mode="json", exclude={"paciente", "calibracao"}), "fonte": "navegador"}
    _com_spl(resultado, entrada.calibracao, {
        "db_inicio": resultado["db_inicio"], "db_fim": resultado["db_fim"],
        "alvo_min": resultado["alvo_dbfs"]["min"], "alvo_max": resultado["alvo_dbfs"]["max"],
    })
    return ResultadoSalvo(avaliacao_id=_salvar(db, user, nome, "carga", resultado), resultado=resultado)


@router.post("/jogos", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_jogo(entrada: JogoEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda o resultado de uma partida no histórico do paciente."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar a partida")
    resultado = {**entrada.model_dump(exclude={"paciente"}), "fonte": "navegador"}
    salvo = _salvar(db, user, nome, "jogo", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/fonetograma", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_fonetograma(entrada: FonetogramaEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda o campo vocal; o resumo é recalculado aqui a partir dos pontos."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar o fonetograma")
    pontos = sorted((p.model_dump() for p in entrada.pontos), key=lambda p: p["midi"])
    resultado = {
        "duracao_s": entrada.duracao_s,
        "pontos": pontos,
        "resumo": resumir_campo(pontos),
        "unidade_intensidade": "dBFS",
        "fonte": "navegador",
    }
    if entrada.calibracao is not None:
        resultado["calibracao"] = entrada.calibracao.model_dump(mode="json")
        resultado["resumo_spl"] = resumo_em_spl(resultado["resumo"], entrada.calibracao.deslocamento_db)
    salvo = _salvar(db, user, nome, "fonetograma", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/anamnese", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_anamnese(entrada: AnamneseEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda a anamnese vocal no histórico do paciente (só os campos preenchidos)."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar a anamnese")
    resultado = {k: v for k, v in entrada.model_dump(exclude={"paciente"}).items() if v not in (None, "", [])}
    salvo = _salvar(db, user, nome, "anamnese", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


#: Planos ativos por paciente: evita links esquecidos circulando.
MAX_PLANOS_ATIVOS = 3


@router.post("/pratica", response_model=PlanoCriado, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(verify_csrf)])
def criar_plano(entrada: PlanoEntrada, user: CurrentUser, db: DbSession) -> PlanoCriado:
    """Cria o plano e devolve o segredo do link UMA vez (só o hash fica salvo)."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente")
    agora = datetime.now(timezone.utc)
    ativos = db.scalars(
        select(HomePracticePlan).where(
            HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome,
            HomePracticePlan.revoked_at.is_(None), HomePracticePlan.expires_at > agora,
        )
    ).all()
    if len(ativos) >= MAX_PLANOS_ATIVOS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{nome} já tem {len(ativos)} links ativos. Revogue um antes de criar outro.",
        )
    token = novo_token()
    plano = HomePracticePlan(
        owner_id=user.id, patient_name=nome, greeting=" ".join(entrada.saudacao.split()) or None,
        token_hash=hash_token(token),
        exercises=[e.model_dump(exclude_none=True) for e in entrada.exercicios],
        expires_at=agora + timedelta(days=entrada.validade_dias),
        # explícito em UTC: a conferência das sessões compara com esta data
        created_at=agora,
    )
    db.add(plano)
    db.commit()
    db.refresh(plano)
    base = plano_out(plano, {}, {})
    return PlanoCriado(**base.model_dump(), token=token)


@router.get("/pratica", response_model=PlanoLista)
def listar_planos(user: CurrentUser, db: DbSession, paciente: PacienteConsulta) -> PlanoLista:
    nome = _paciente(paciente)
    if nome is None:
        return PlanoLista(items=[])
    planos = db.scalars(
        select(HomePracticePlan)
        .where(HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome)
        .order_by(HomePracticePlan.created_at.desc())
        .limit(50)
    ).all()
    total, ultima = sessoes_por_plano(db, user.id, [p.id for p in planos])
    return PlanoLista(items=[plano_out(p, total, ultima) for p in planos])


@router.post("/pratica/{plano_id}/revogar", response_model=PlanoOut, dependencies=[Depends(verify_csrf)])
def revogar_plano(plano_id: str, user: CurrentUser, db: DbSession) -> PlanoOut:
    """O link para de funcionar na hora; as sessões já recebidas continuam no histórico."""
    plano = db.get(HomePracticePlan, plano_id)
    if plano is None or plano.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")
    if plano.revoked_at is None:
        plano.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(plano)
    total, ultima = sessoes_por_plano(db, user.id, [plano.id])
    return plano_out(plano, total, ultima)


@router.post("/ddk", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
async def analisar_ddk_rota(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    tarefa: str = Form("pa"),
    paciente: str | None = Form(None),
    guardar_audio: bool = Form(True),
) -> ResultadoSalvo:
    """Diadococinesia (/pa/, /ta/, /ka/, /pataka/): taxa e regularidade das sílabas (WAV)."""
    enforce_rate_limit(
        request,
        bucket="voz_clinica",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    nome = _paciente(paciente)
    dados = await _read_limited(file, MAX_WAV_BYTES)
    try:
        resultado = await asyncio.to_thread(lambda: analisar_ddk(limitar_duracao(voz_clinica.ler_wav(dados), 30), tarefa=tarefa))
    except (voz_clinica.ErroAudio, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Voz clínica: falha na análise da diadococinesia")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível analisar a gravação") from exc
    if nome is None or "silabas" not in resultado:
        return ResultadoSalvo(avaliacao_id=None, resultado=resultado)
    return await _salvar_com_audio(db, user, nome, "ddk", resultado, dados, guardar_audio)


def _juntar_wav(vogal: "voz_clinica.Audio", frase: "voz_clinica.Audio") -> bytes:
    """Um só arquivo para guardar: vogal, 0,5 s de silêncio e frase (16 bits, taxa da vogal)."""
    import io

    import numpy as np
    from scipy.io import wavfile
    from scipy.signal import resample_poly

    f = frase.amostras if frase.taxa == vogal.taxa else resample_poly(frase.amostras, vogal.taxa, frase.taxa)
    x = np.concatenate((vogal.amostras, np.zeros(int(0.5 * vogal.taxa)), f))
    buf = io.BytesIO()
    wavfile.write(buf, vogal.taxa, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    return buf.getvalue()


@router.post("/cepstral", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
async def analisar_cepstral_rota(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    vogal: UploadFile = File(...),
    frase: UploadFile = File(...),
    motor: str = Form("auto"),
    paciente: str | None = Form(None),
    guardar_audio: bool = Form(True),
) -> ResultadoSalvo:
    """Análise cepstral: CPP e CPPS da vogal e da frase, e AVQI (Praat). Dois WAV."""
    enforce_rate_limit(
        request,
        bucket="voz_clinica",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    nome = _paciente(paciente)
    dados_v = await _read_limited(vogal, MAX_WAV_BYTES)
    dados_f = await _read_limited(frase, MAX_WAV_BYTES)

    def _rodar() -> tuple[dict, bytes]:
        a_v = limitar_duracao(voz_clinica.ler_wav(dados_v), 30, "A vogal")
        a_f = limitar_duracao(voz_clinica.ler_wav(dados_f), 30, "A frase")
        return analisar_cepstral(a_v, a_f, motor=motor), _juntar_wav(a_v, a_f)

    try:
        resultado, junto = await asyncio.to_thread(_rodar)
    except (voz_clinica.ErroAudio, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Voz clínica: falha na análise cepstral")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível analisar as gravações") from exc
    if nome is None or resultado["vogal"].get("cpps_db") is None:
        return ResultadoSalvo(avaliacao_id=None, resultado=resultado)
    return await _salvar_com_audio(db, user, nome, "cepstral", resultado, junto, guardar_audio)


@router.post("/dsi", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def calcular_dsi(entrada: DsiEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """DSI (Wuyts et al., 2000). Com paciente, fica salvo com as quatro medidas usadas."""
    resultado = dsi(entrada.tmf_s, entrada.f0_alta_hz, entrada.i_baixa_db_spl, entrada.jitter_pct)
    return ResultadoSalvo(avaliacao_id=_salvar(db, user, _paciente(entrada.paciente), "dsi", resultado), resultado=resultado)


@router.get("/pacientes", response_model=PacienteLista)
def listar_pacientes(user: CurrentUser, db: DbSession) -> PacienteLista:
    linhas = db.execute(
        select(
            ClinicalEvaluation.patient_name,
            func.count(ClinicalEvaluation.id),
            func.max(ClinicalEvaluation.created_at),
        )
        .where(ClinicalEvaluation.owner_id == user.id)
        .group_by(ClinicalEvaluation.patient_name)
        .order_by(func.max(ClinicalEvaluation.created_at).desc())
        .limit(1000)
    ).all()
    cadastros = {p.name: p for p in db.scalars(select(VoicePatient).where(VoicePatient.owner_id == user.id)).all()}
    itens = [PacienteResumo(paciente=n, avaliacoes=c, ultima=u, cadastro=n in cadastros) for n, c, u in linhas]
    vistos = {i.paciente for i in itens}
    # cadastrados que ainda não têm avaliação também aparecem na lista
    itens += [PacienteResumo(paciente=n, avaliacoes=0, ultima=p.updated_at, cadastro=True)
              for n, p in cadastros.items() if n not in vistos]
    return PacienteLista(items=itens)


def _idade(nascimento: date | None, em: date | None = None) -> int | None:
    if nascimento is None:
        return None
    hoje = em or date.today()
    return hoje.year - nascimento.year - ((hoje.month, hoje.day) < (nascimento.month, nascimento.day))


def _cadastro_out(p: VoicePatient) -> CadastroOut:
    return CadastroOut(
        paciente=p.name, data_nascimento=p.birth_date, idade=_idade(p.birth_date), sexo=p.sex, telefone=p.phone,
        email=p.email, profissao=p.occupation, profissional_da_voz=p.voice_professional, observacoes=p.notes,
        atualizado_em=p.updated_at,
    )


def _cadastro(db: DbSession, user: CurrentUser, nome: str) -> VoicePatient | None:
    return db.scalar(select(VoicePatient).where(VoicePatient.owner_id == user.id, VoicePatient.name == nome))


@router.get("/pacientes/cadastro", response_model=CadastroOut)
def obter_cadastro(user: CurrentUser, db: DbSession, paciente: PacienteConsulta) -> CadastroOut:
    p = _cadastro(db, user, _nome_obrigatorio(paciente))
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente sem cadastro")
    return _cadastro_out(p)


@router.put("/pacientes/cadastro", response_model=CadastroOut, dependencies=[Depends(verify_csrf)])
def salvar_cadastro(entrada: CadastroEntrada, user: CurrentUser, db: DbSession) -> CadastroOut:
    """Cria ou atualiza o cadastro (o nome/código liga o cadastro às avaliações)."""
    nome = _nome_obrigatorio(entrada.paciente)
    p = _cadastro(db, user, nome)
    if p is None:
        p = VoicePatient(owner_id=user.id, name=nome)
        db.add(p)
    p.birth_date, p.sex, p.phone, p.email = entrada.data_nascimento, entrada.sexo, entrada.telefone, entrada.email
    p.occupation, p.voice_professional, p.notes = entrada.profissao, entrada.profissional_da_voz, entrada.observacoes
    db.commit()
    db.refresh(p)
    return _cadastro_out(p)


def _nome_obrigatorio(paciente: str | None) -> str:
    nome = _paciente(paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente")
    return nome


def _rastro(user_id: str, nome: str) -> str:
    """Identifica o paciente no log de auditoria sem gravar o nome (minimização)."""
    # HMAC com segredo do servidor: sem o segredo, não dá para testar nomes num dicionário
    return hmac.new(settings.jwt_secret.encode("utf-8"), f"{user_id}:{nome}".encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def _dados_exportacao(db: DbSession, user: CurrentUser, nome: str) -> tuple[dict, list[ClinicalEvaluation], int]:
    """Tudo o que está guardado do paciente (avaliações, planos, cadastro), no formato de exportação."""
    rows = list(db.scalars(
        select(ClinicalEvaluation)
        .where(ClinicalEvaluation.owner_id == user.id, ClinicalEvaluation.patient_name == nome)
        .order_by(ClinicalEvaluation.created_at)
    ).all())
    planos = db.scalars(
        select(HomePracticePlan)
        .where(HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome)
        .order_by(HomePracticePlan.created_at)
    ).all()
    cadastro = _cadastro(db, user, nome)
    if not rows and not planos and cadastro is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nada guardado para este paciente")
    total, ultima = sessoes_por_plano(db, user.id, [p.id for p in planos])
    corpo = {
        "formato": "voicecheck-voz-clinica/1",
        "paciente": nome,
        "exportado_em": datetime.now(timezone.utc).isoformat(),
        "cadastro": _cadastro_out(cadastro).model_dump(mode="json") if cadastro else None,
        "avaliacoes": [_saida(r).model_dump(mode="json") for r in rows],
        # o segredo dos links nunca é exportado (só o hash existe no banco, e ele também fica fora)
        "planos_pratica": [plano_out(p, total, ultima).model_dump(mode="json") for p in planos],
        "gravacoes_guardadas": sum(1 for r in rows if r.audio_key),
    }
    return corpo, rows, len(planos)


def _nome_arquivo(nome: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", nome.lower()).encode("ascii", "ignore").decode("ascii")
    return "voicecheck-" + ("".join(c if c.isalnum() else "-" for c in ascii_).strip("-")[:40] or "paciente")


@router.get("/pacientes/exportar")
def exportar_paciente(request: Request, user: CurrentUser, db: DbSession, paciente: PacienteConsulta) -> JSONResponse:
    """LGPD art. 18 (acesso e portabilidade): tudo o que está guardado deste paciente, sem limite.

    Só os dados; com as gravações, use /pacientes/exportar-zip.
    """
    nome = _nome_obrigatorio(paciente)
    corpo, rows, n_planos = _dados_exportacao(db, user, nome)
    # o áudio não vai dentro do JSON: o ZIP (/pacientes/exportar-zip) leva as gravações
    write_audit(
        db, action="voz_clinica.paciente_exportado", resource_type="paciente", actor_id=user.id, request=request,
        meta={"paciente": _rastro(user.id, nome), "avaliacoes": len(rows), "planos": n_planos}, commit=True,
    )
    return JSONResponse(
        corpo,
        headers={
            "Content-Disposition": f'attachment; filename="{_nome_arquivo(nome)}-{datetime.now(timezone.utc):%Y%m%d}.json"',
            "Cache-Control": "no-store",
        },
    )


LEIAME_ZIP = """VoiceCheck IA 2.0 - exportação dos dados do paciente (LGPD, art. 18)

dados.json      cadastro, avaliações, protocolos, anotações e planos de prática em casa
gravacoes/      as gravações guardadas, em WAV (abre no Praat, Audacity ou qualquer player)
midias/         imagens e vídeos do paciente, no formato em que foram enviados

Cada gravação tem o nome data_tipo_código.wav; o código são os 8 primeiros caracteres
do "id" da avaliação no dados.json (campo "arquivo_audio" de cada avaliação).
Guarde este arquivo com o mesmo cuidado de um prontuário.
"""


def _montar_zip(corpo: dict, rows: list[ClinicalEvaluation]) -> tuple[object, int]:
    """Escreve o ZIP num arquivo temporário (memória até 16 MB, depois disco). Roda fora do loop."""
    import json
    import tempfile
    import zipfile

    destino = tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024)
    faltando = 0
    por_id = {a["id"]: a for a in corpo["avaliacoes"]}
    with zipfile.ZipFile(destino, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for r in rows:
            if not r.audio_key:
                continue
            if r.kind == "midia":
                arquivo = f"midias/{r.created_at:%Y-%m-%d_%H%M%S}_{r.id[:8]}.{(r.result or {}).get('extensao', 'bin')}"
            else:
                arquivo = f"gravacoes/{r.created_at:%Y-%m-%d_%H%M%S}_{r.kind}_{r.id[:8]}.wav"
            try:
                dados = get_storage().get_bytes(r.audio_key)
            except Exception:  # noqa: BLE001 — uma gravação faltando não impede a exportação
                logger.exception("Voz clínica: gravação ausente na exportação")
                faltando += 1
                por_id[r.id]["arquivo_audio"] = None
                continue
            # WAV já é grande e pouco compressível: guardado sem compressão, mais rápido
            zf.writestr(zipfile.ZipInfo(arquivo, date_time=r.created_at.timetuple()[:6]), dados, compress_type=zipfile.ZIP_STORED)
            por_id[r.id]["arquivo_audio"] = arquivo
        corpo["gravacoes_indisponiveis"] = faltando
        zf.writestr("dados.json", json.dumps(corpo, ensure_ascii=False, indent=2))
        zf.writestr("LEIAME.txt", LEIAME_ZIP)
    tamanho = destino.tell()
    destino.seek(0)
    return destino, tamanho


@router.get("/pacientes/exportar-zip")
async def exportar_paciente_zip(request: Request, user: CurrentUser, db: DbSession, paciente: PacienteConsulta) -> StreamingResponse:
    """LGPD art. 18 (portabilidade): dados.json + todas as gravações em WAV, num ZIP."""
    enforce_rate_limit(request, bucket="voz_clinica_zip", limit=10, window_sec=600)
    nome = _nome_obrigatorio(paciente)
    corpo, rows, n_planos = _dados_exportacao(db, user, nome)
    arquivo, tamanho = await asyncio.to_thread(_montar_zip, corpo, rows)
    write_audit(
        db, action="voz_clinica.paciente_exportado", resource_type="paciente", actor_id=user.id, request=request,
        meta={"paciente": _rastro(user.id, nome), "avaliacoes": len(rows), "planos": n_planos,
              "formato": "zip", "gravacoes": corpo["gravacoes_guardadas"] - corpo["gravacoes_indisponiveis"]},
        commit=True,
    )

    def blocos():
        try:
            while bloco := arquivo.read(1024 * 1024):
                yield bloco
        finally:
            arquivo.close()

    return StreamingResponse(
        blocos(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{_nome_arquivo(nome)}-{datetime.now(timezone.utc):%Y%m%d}.zip"',
            "Content-Length": str(tamanho),
            "Cache-Control": "no-store",
        },
    )


@router.delete("/pacientes", dependencies=[Depends(verify_csrf)])
def excluir_paciente(request: Request, user: CurrentUser, db: DbSession, paciente: PacienteConsulta) -> dict:
    """LGPD art. 18 (eliminação): apaga todas as avaliações e links de prática do paciente.

    Os links ativos param na hora (o plano deixa de existir). Irreversível.
    """
    nome = _nome_obrigatorio(paciente)
    filtro_aval = (ClinicalEvaluation.owner_id == user.id, ClinicalEvaluation.patient_name == nome)
    filtro_plano = (HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome)
    chaves = [c for c in db.scalars(select(ClinicalEvaluation.audio_key).where(*filtro_aval)).all() if c]
    n_aval = db.execute(delete(ClinicalEvaluation).where(*filtro_aval)).rowcount or 0
    n_planos = db.execute(delete(HomePracticePlan).where(*filtro_plano)).rowcount or 0
    n_cad = db.execute(delete(VoicePatient).where(VoicePatient.owner_id == user.id, VoicePatient.name == nome)).rowcount or 0
    if not n_aval and not n_planos and not n_cad:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nada guardado para este paciente")
    write_audit(
        db, action="voz_clinica.paciente_excluido", resource_type="paciente", actor_id=user.id, request=request,
        meta={"paciente": _rastro(user.id, nome), "avaliacoes": n_aval, "planos": n_planos, "gravacoes": len(chaves)},
    )
    db.commit()
    _apagar_audios(db, chaves)
    return {"avaliacoes_excluidas": n_aval, "planos_excluidos": n_planos, "gravacoes_excluidas": len(chaves),
            "cadastro_excluido": bool(n_cad)}


@router.get("/avaliacoes", response_model=AvaliacaoLista)
def listar_avaliacoes(user: CurrentUser, db: DbSession, paciente: PacienteConsulta,
                      tipo: TipoAvaliacao | None = None) -> AvaliacaoLista:
    """As 500 mais recentes; `tipo` filtra (p. ex. todos os fonetogramas, mesmo num histórico longo)."""
    stmt = select(ClinicalEvaluation).where(ClinicalEvaluation.owner_id == user.id)
    nome = _paciente(paciente)
    if nome is not None:
        stmt = stmt.where(ClinicalEvaluation.patient_name == nome)
    if tipo is not None:
        stmt = stmt.where(ClinicalEvaluation.kind == tipo)
    rows = db.scalars(stmt.order_by(ClinicalEvaluation.created_at.desc()).limit(500)).all()
    return AvaliacaoLista(items=[_saida(r) for r in rows])


def _avaliacao_do_usuario(db: DbSession, user: CurrentUser, avaliacao_id: str) -> ClinicalEvaluation:
    try:
        ident = str(uuid.UUID(avaliacao_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada") from exc
    row = db.scalar(
        select(ClinicalEvaluation).where(ClinicalEvaluation.id == ident, ClinicalEvaluation.owner_id == user.id)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada")
    return row


@router.delete(
    "/avaliacoes/{avaliacao_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    # explícito: com "from __future__ import annotations" o FastAPI lê "-> None" como o tipo
    # NoneType e recusa a rota 204 ("must not have a response body") — a API nem sobe
    response_model=None,
    dependencies=[Depends(verify_csrf)],
)
def excluir_avaliacao(avaliacao_id: str, user: CurrentUser, db: DbSession) -> None:
    row = _avaliacao_do_usuario(db, user, avaliacao_id)
    chave = row.audio_key
    db.delete(row)
    db.commit()
    _apagar_audios(db, [chave] if chave else [])


@router.put("/avaliacoes/{avaliacao_id}/anotacao", response_model=AvaliacaoOut, dependencies=[Depends(verify_csrf)])
def anotar_avaliacao(avaliacao_id: str, entrada: AnotacaoEntrada, user: CurrentUser, db: DbSession) -> AvaliacaoOut:
    """Anotação livre do profissional sobre a avaliação (texto vazio apaga). O resultado calculado não muda."""
    row = _avaliacao_do_usuario(db, user, avaliacao_id)
    texto = entrada.texto.strip()
    row.notes = texto or None
    db.commit()
    db.refresh(row)
    return _saida(row)


@router.post("/midias", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
async def enviar_midia(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    paciente: str = Form(...),
    descricao: str | None = Form(None),
) -> ResultadoSalvo:
    """Imagem ou vídeo do paciente (como o iVox): guardado no storage, conta na cota do plano."""
    enforce_rate_limit(request, bucket="voz_clinica_midia", limit=30, window_sec=600)
    nome = _paciente(paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente")
    if descricao is not None and len(descricao) > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Descrição com até 200 caracteres")
    uid = user.id  # antes do rollback abaixo (ler user.id depois dele abriria o snapshot antes da trava)
    async with _MEMORIA_PESADA:
        return await _enviar_midia(db, uid, nome, descricao, file)


async def _enviar_midia(db: DbSession, uid: str, nome: str, descricao: str | None, file: UploadFile) -> ResultadoSalvo:
    dados = await _read_limited(file, max_bytes=midias.LIMITE_VIDEO)
    try:
        categoria, mime, ext = midias.validar(dados)
    except midias.ErroMidia as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc
    resultado = {
        "categoria": categoria, "mime": mime, "extensao": ext, "bytes": len(dados),
        "nome_original": midias.nome_seguro(file.filename), "descricao": (descricao or "").strip() or None,
    }
    # a leitura do usuário (login) já abriu a transação: encerra, para a trava ser o primeiro comando
    db.rollback()
    row_id = str(uuid.uuid4())
    chave = f"voz-clinica/{uid}/midia/{row_id}.{ext}"
    # 1) reserva (transação curta, sem await): trava, confere a cota e grava o registro
    try:
        _travar_cota(db, uid)
        assert_can_upload(db, uid, len(dados))
        db.add(ClinicalEvaluation(id=row_id, owner_id=uid, patient_name=nome, kind="midia", engine=None,
                                  result=resultado, audio_key=chave, audio_bytes=len(dados)))
        db.commit()
    except QuotaExceeded as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=exc.message) from exc
    except BaseException:
        db.rollback()
        raise
    # 2) envio ao storage, já sem a trava; se falhar, o registro sai e o envio parcial é apagado
    try:
        await asyncio.to_thread(get_storage().put_bytes, chave, dados, mime)
    except Exception:
        try:
            db.execute(ClinicalEvaluation.__table__.delete().where(ClinicalEvaluation.id == row_id))
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            logger.exception("Voz clínica: falha ao desfazer o registro da mídia")
        await asyncio.to_thread(_apagar_audios, db, [chave])
        raise
    if not _ainda_ligado(db, row_id, chave):  # excluída durante o envio
        await asyncio.to_thread(_apagar_audios, db, [chave])
    return ResultadoSalvo(avaliacao_id=row_id, resultado=resultado)


@router.get("/midias/{avaliacao_id}")
def ver_midia(avaliacao_id: str, user: CurrentUser, db: DbSession) -> Response:
    """O arquivo da mídia (só para o dono), com o tipo detectado no envio."""
    row = _avaliacao_do_usuario(db, user, avaliacao_id)
    if row.kind != "midia" or not row.audio_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mídia não encontrada")
    try:
        dados = get_storage().get_bytes(row.audio_key)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Voz clínica: mídia sumiu do storage")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mídia não encontrada no armazenamento") from exc
    r = row.result or {}
    return Response(
        dados,
        media_type=r.get("mime", "application/octet-stream"),
        headers={
            "Content-Disposition": f'inline; filename="voicecheck-midia-{row.created_at:%Y%m%d-%H%M}.{r.get("extensao", "bin")}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@router.get("/avaliacoes/{avaliacao_id}/audio")
def ouvir_avaliacao(avaliacao_id: str, user: CurrentUser, db: DbSession) -> Response:
    """A gravação guardada de uma análise acústica (só para o dono)."""
    row = _avaliacao_do_usuario(db, user, avaliacao_id)
    if row.audio_key is None or row.kind == "midia":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Esta avaliação não tem gravação guardada")
    try:
        dados = get_storage().get_bytes(row.audio_key)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Voz clínica: gravação sumiu do storage")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gravação não encontrada no armazenamento") from exc
    return Response(
        dados,
        media_type="audio/wav",
        headers={
            "Content-Disposition": f'inline; filename="voicecheck-{row.created_at:%Y%m%d-%H%M}.wav"',
            "Cache-Control": "private, no-store",
        },
    )
