"""VoiceCheck IA — preparação local (probe + extração de áudio)."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, Response

from app.core.config import get_settings
from app.core.deps import CurrentUser, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.schemas.voicecheck import VoiceCheckPrepareResponse, VoiceCheckProbeOut
from app.services.voicecheck_alignment import align_notes
from app.services.voicecheck_analysis import build_analysis_report, build_with_reference_report
from app.services.voicecheck_comparison import compare_alignment
from app.services.voicecheck_feedback import recommendations_from_events
from app.services.voicecheck_media import (
    assert_allowed_filename,
    assert_safe_job_id,
    cleanup_job,
    extract_audio_wav,
    job_dir,
    probe_media,
    purge_stale_jobs,
    read_meta,
    wav_info,
    write_meta,
)
from app.services.voicecheck_pitch import (
    YinParams,
    adapt_params_for_duration,
    extract_f0,
    load_wav_bytes,
)
from app.services.voicecheck_artist_reference import parse_artist_reference_bytes
from app.services.voicecheck_autotune import AutotuneParams, autotune_wav_bytes
from app.services.voicecheck_audio_reference import (
    is_audio_reference_filename,
    parse_audio_reference_bytes,
)
from app.services.voicecheck_musicxml import list_musicxml_parts, parse_musicxml_bytes
from app.services.voicecheck_reference import list_midi_tracks, parse_midi_bytes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voicecheck", tags=["voicecheck"])
settings = get_settings()


def _storage_root() -> Path:
    return Path(settings.local_storage_path)


async def _read_limited(file: UploadFile, max_bytes: int | None = None) -> bytes:
    """Lê o upload em blocos e aborta ao passar do limite (evita carregar
    arquivos gigantes inteiros na memória antes de checar o tamanho)."""
    limit = max_bytes if max_bytes is not None else settings.max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Arquivo excede o limite de {limit} bytes",
                )
            chunks.append(chunk)
    finally:
        await file.close()
    return b"".join(chunks)


@router.post(
    "/prepare",
    response_model=VoiceCheckPrepareResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
async def prepare_media(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(...),
) -> VoiceCheckPrepareResponse:
    """Valida com ffprobe, extrai áudio para WAV interno. Não altera o arquivo original do usuário."""
    enforce_rate_limit(
        request,
        bucket="voicecheck",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )

    try:
        purge_stale_jobs(_storage_root(), user.id, max_age_hours=settings.voicecheck_job_ttl_hours)
    except (OSError, ValueError):
        logger.warning("VoiceCheck: limpeza de jobs antigos falhou", exc_info=True)

    filename = file.filename or "upload.bin"
    try:
        safe_name = assert_allowed_filename(filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    job_id = str(uuid4())
    try:
        work = job_dir(_storage_root(), user.id, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    work.mkdir(parents=True, exist_ok=True)
    ext = Path(safe_name).suffix.lower()
    original_path = work / f"original{ext}"
    wav_path = work / "prepared.wav"

    size = 0
    max_bytes = settings.max_upload_bytes
    try:
        with original_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Arquivo excede o limite de {max_bytes} bytes",
                    )
                out.write(chunk)
    except HTTPException:
        cleanup_job(work)
        raise
    except Exception as exc:
        cleanup_job(work)
        logger.exception("VoiceCheck write failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao gravar arquivo temporário",
        ) from exc
    finally:
        await file.close()

    if size == 0:
        cleanup_job(work)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio")

    probe = probe_media(original_path)
    if not probe.ffprobe_ok:
        cleanup_job(work)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ffprobe indisponível ou arquivo ilegível — instale FFmpeg no host da API",
        )
    if not probe.has_audio:
        cleanup_job(work)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma faixa de áudio detectada no arquivo",
        )
    if probe.duration_ms is not None and probe.duration_ms > settings.max_duration_seconds * 1000:
        cleanup_job(work)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Duração acima do limite ({settings.max_duration_seconds}s)",
        )

    try:
        extract_audio_wav(original_path, wav_path, sample_rate=44100)
        duration_ms, sr, ch = wav_info(wav_path)
    except RuntimeError as exc:
        cleanup_job(work)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    finally:
        # Não retemos cópia do original no servidor — o usuário mantém o arquivo no browser
        try:
            if original_path.is_file():
                original_path.unlink()
        except OSError:
            pass

    meta = {
        "user_id": user.id,
        "job_id": job_id,
        "original_filename": safe_name,
        "probe": probe.to_dict(),
        "wav": {
            "duration_ms": duration_ms,
            "sample_rate": sr,
            "channels": ch,
            "size_bytes": wav_path.stat().st_size,
        },
    }
    write_meta(work, meta)

    return VoiceCheckPrepareResponse(
        job_id=job_id,
        original_filename=safe_name,
        original_unchanged=True,
        probe=VoiceCheckProbeOut(**probe.to_dict()),
        wav=meta["wav"],
        audio_path=f"/api/v1/voicecheck/jobs/{job_id}/audio",
        message="Áudio extraído para WAV interno (mono 44.1 kHz). Original do usuário intacto.",
    )


@router.get("/jobs/{job_id}/audio")
def download_prepared_audio(job_id: str, user: CurrentUser) -> FileResponse:
    try:
        assert_safe_job_id(job_id)
        work = job_dir(_storage_root(), user.id, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    meta = read_meta(work)
    if not meta or meta.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job não encontrado")

    wav_path = work / "prepared.wav"
    if not wav_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WAV preparado ausente")

    return FileResponse(
        path=wav_path,
        media_type="audio/wav",
        filename="voicecheck-prepared.wav",
    )


@router.delete(
    "/jobs/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(verify_csrf)],
)
def delete_job(job_id: str, user: CurrentUser) -> Response:
    try:
        work = job_dir(_storage_root(), user.id, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    meta = read_meta(work)
    if meta and meta.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job não encontrado")
    cleanup_job(work)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/analyze",
    dependencies=[Depends(verify_csrf)],
)
async def analyze_prepared_wav(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(..., description="WAV PCM 16-bit preparado"),
    fmin_hz: float = Form(65.0),
    fmax_hz: float = Form(1100.0),
    frame_length: int = Form(2048),
    hop_length: int = Form(512),
    periodicity_threshold: float = Form(0.15),
) -> JSONResponse:
    """
    Análise F0 (YIN) sem referência musical.
    Não gera feedback de erro de afinação.
    """
    enforce_rate_limit(
        request,
        bucket="voicecheck_analyze",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )

    raw = await _read_limited(file)
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio")
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="WAV excede o limite configurado",
        )
    if raw[:4] != b"RIFF":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo inválido — envie o WAV preparado (RIFF/WAVE)",
        )

    params = YinParams(
        frame_length=max(512, min(8192, int(frame_length))),
        hop_length=max(64, min(4096, int(hop_length))),
        fmin_hz=max(40.0, min(300.0, float(fmin_hz))),
        fmax_hz=max(200.0, min(2000.0, float(fmax_hz))),
        periodicity_threshold=max(0.05, min(0.4, float(periodicity_threshold))),
    )
    if params.fmax_hz <= params.fmin_hz * 1.5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="fmax_hz deve ser significativamente maior que fmin_hz",
        )

    def _compute() -> dict:
        samples_local, sr_local = load_wav_bytes(raw)
        duration_local = len(samples_local) / float(sr_local)
        p = adapt_params_for_duration(params, duration_local)
        frames_local = extract_f0(samples_local, sr_local, p)
        return build_analysis_report(
            frames_local,
            sample_rate=sr_local,
            duration_seconds=duration_local,
            params=p,
            samples=samples_local,
        )

    try:
        report = await asyncio.to_thread(_compute)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("VoiceCheck analyze failed user=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha na análise F0",
        ) from exc

    return JSONResponse(content=report)


@router.post(
    "/midi/tracks",
    dependencies=[Depends(verify_csrf)],
)
async def midi_tracks(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(...),
) -> JSONResponse:
    enforce_rate_limit(
        request,
        bucket="voicecheck_midi",
        limit=20,
        window_sec=60,
    )
    raw = await _read_limited(file)
    if not raw:
        raise HTTPException(status_code=400, detail="MIDI vazio")
    try:
        tracks = list_midi_tracks(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"MIDI ilegível: {exc}") from exc
    return JSONResponse(content={"tracks": tracks})


@router.post(
    "/musicxml/parts",
    dependencies=[Depends(verify_csrf)],
)
async def musicxml_parts(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(...),
) -> JSONResponse:
    enforce_rate_limit(
        request,
        bucket="voicecheck_musicxml",
        limit=20,
        window_sec=60,
    )
    raw = await _read_limited(file)
    if not raw:
        raise HTTPException(status_code=400, detail="MusicXML vazio")
    try:
        parts = list_musicxml_parts(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"MusicXML ilegível: {exc}") from exc
    return JSONResponse(content={"parts": parts})


def _detect_ref_kind(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith((".mid", ".midi")) or data[:4] == b"MThd":
        return "midi"
    if name.endswith((".musicxml", ".xml", ".mxl")):
        return "musicxml"
    head = data[:200].lstrip()
    if head.startswith(b"<?xml") or head.startswith(b"<score-partwise") or head.startswith(
        b"<score-timewise"
    ):
        return "musicxml"
    if is_audio_reference_filename(name) or data[:4] == b"RIFF" or data[:3] == b"ID3":
        return "audio"
    # ftyp (mp4/m4a) / Ogg
    if b"ftyp" in data[:32] or data[:4] == b"OggS" or data[:4] == b"fLaC":
        return "audio"
    raise HTTPException(
        status_code=400,
        detail=(
            "Referência deve ser MIDI (.mid), MusicXML (.musicxml/.xml) "
            "ou áudio (.wav/.mp3/.flac/.m4a)."
        ),
    )


@router.post(
    "/analyze-with-reference",
    dependencies=[Depends(verify_csrf)],
)
async def analyze_with_reference(
    request: Request,
    user: CurrentUser,
    wav: UploadFile = File(..., description="WAV preparado"),
    reference: UploadFile = File(..., description="MIDI, MusicXML ou áudio de referência"),
    track_index: int | None = Form(None),
    accept_transposition: bool = Form(False),
    pitch_tolerance_cents: float = Form(50.0),
    onset_tolerance_ms: float = Form(120.0),
    fmin_hz: float = Form(65.0),
    fmax_hz: float = Form(1100.0),
    reference_mode: str = Form("custom"),
    isolate_vocals: bool = Form(False),
) -> JSONResponse:
    """
    Fase 4: F0 da execução + MIDI/MusicXML/áudio-ref/artista → alinhamento e comparação.
    reference_mode: score | artist | custom (compatível com midi/musicxml/audio).
    """
    enforce_rate_limit(
        request,
        bucket="voicecheck_analyze_ref",
        limit=max(3, settings.rate_limit_upload // 3),
        window_sec=settings.rate_limit_upload_window_sec,
    )

    wav_bytes = await _read_limited(wav)
    ref_bytes = await _read_limited(reference)

    if not wav_bytes or wav_bytes[:4] != b"RIFF":
        raise HTTPException(status_code=400, detail="Envie o WAV preparado (RIFF)")
    kind = _detect_ref_kind(reference.filename or "", ref_bytes)
    mode_norm = (reference_mode or "custom").strip().lower()
    # Aliases legados / UI
    if mode_norm in {"midi", "musicxml"}:
        mode_norm = "score"
    if mode_norm == "audio":
        mode_norm = "custom"
    if mode_norm == "artist":
        isolate_vocals = True
        if kind != "audio":
            raise HTTPException(
                status_code=400,
                detail="Modo artista exige arquivo de áudio (mp3/wav/flac/m4a).",
            )
    if kind == "musicxml" and (reference.filename or "").lower().endswith(".mxl"):
        raise HTTPException(
            status_code=400,
            detail="Arquivo .mxl (zip) ainda não suportado — exporte .musicxml/.xml.",
        )

    params = YinParams(
        fmin_hz=max(40.0, min(300.0, float(fmin_hz))),
        fmax_hz=max(200.0, min(2000.0, float(fmax_hz))),
    )

    def _compute_ref() -> dict:
        samples_local, sr_local = load_wav_bytes(wav_bytes)
        duration_local = len(samples_local) / float(sr_local)
        p = adapt_params_for_duration(params, duration_local)
        frames_local = extract_f0(samples_local, sr_local, p)
        artist_meta = None
        ref_quality = None
        vocal_part = None
        if kind == "midi":
            ref_local = parse_midi_bytes(ref_bytes, track_index=track_index)
            mode_out = "score"
            ref_quality = "symbolic"
        elif kind == "musicxml":
            ref_local = parse_musicxml_bytes(ref_bytes, part_index=track_index)
            mode_out = "score"
            ref_quality = "symbolic"
        elif mode_norm == "artist" or isolate_vocals:
            artist = parse_artist_reference_bytes(
                ref_bytes,
                filename=reference.filename or "artist.mp3",
                params=p,
                isolate=True,
            )
            ref_local = artist.reference
            mode_out = "artist"
            ref_quality = artist.quality
            vocal_part = artist.selected_vocal_part
            artist_meta = artist.to_meta_dict()
        else:
            ref_local = parse_audio_reference_bytes(
                ref_bytes,
                filename=reference.filename or "ref.wav",
                params=p,
            )
            mode_out = "custom"
            ref_quality = "audio_f0"

        alignment_local = align_notes(
            frames_local,
            ref_local.notes,
            accept_transposition=bool(accept_transposition),
            forced_transposition=0,
        )
        if accept_transposition and alignment_local.transposition_semitones != 0:
            alignment_local = align_notes(
                frames_local,
                ref_local.notes,
                accept_transposition=True,
                forced_transposition=alignment_local.transposition_semitones,
            )
        comparison_local = compare_alignment(
            frames_local,
            alignment_local,
            pitch_tolerance_cents=float(pitch_tolerance_cents),
            onset_tolerance_ms=float(onset_tolerance_ms),
            accept_transposition=bool(accept_transposition),
        )
        recs_local = recommendations_from_events(comparison_local.get("events") or [])
        extra_w = list(ref_local.warnings) + list(alignment_local.warnings)
        return build_with_reference_report(
            frames_local,
            sample_rate=sr_local,
            duration_seconds=duration_local,
            params=p,
            reference_dict=ref_local.to_dict(),
            alignment_dict=alignment_local.to_dict(),
            comparison=comparison_local,
            recommendations=recs_local,
            extra_warnings=extra_w,
            samples=samples_local,
            reference_mode=mode_out,
            reference_quality=ref_quality,
            selected_vocal_part=vocal_part,
            artist_meta=artist_meta,
        )

    try:
        report = await asyncio.to_thread(_compute_ref)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("analyze-with-reference failed")
        raise HTTPException(status_code=500, detail="Falha na análise com referência") from exc

    return JSONResponse(content=report)


@router.post(
    "/devolutiva",
    dependencies=[Depends(verify_csrf)],
)
async def build_devolutiva(
    request: Request,
    user: CurrentUser,
) -> JSONResponse:
    """
    Gera Devolutiva Vocal do Aluno a partir do JSON de análise já calculado.
    Não reexecuta DSP.
    """
    enforce_rate_limit(
        request,
        bucket="voicecheck_devolutiva",
        limit=max(10, settings.rate_limit_upload),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="JSON inválido") from exc

    analysis = body.get("analysis") if isinstance(body, dict) else None
    if not isinstance(analysis, dict):
        analysis = body if isinstance(body, dict) else None
    if not isinstance(analysis, dict) or not analysis.get("analysis_version"):
        raise HTTPException(
            status_code=400,
            detail="Envie o JSON de análise (campo analysis ou corpo raiz).",
        )

    from app.services.voicecheck_student_report import build_student_devolutiva

    personal = body.get("personal") if isinstance(body.get("personal"), dict) else {}
    try:
        devolutiva = build_student_devolutiva(
            analysis,
            student_name=personal.get("student_name") or body.get("student_name"),
            teacher_name=personal.get("teacher_name") or body.get("teacher_name"),
            teacher_observations=body.get("teacher_observations"),
            final_message_override=body.get("final_message"),
        )
    except Exception as exc:
        logger.exception("devolutiva failed")
        raise HTTPException(status_code=500, detail="Falha ao gerar devolutiva") from exc

    return JSONResponse(content=devolutiva)


@router.post(
    "/autotune",
    dependencies=[Depends(verify_csrf)],
    responses={200: {"content": {"audio/wav": {}}}},
)
async def autotune_prepared_wav(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(..., description="WAV PCM 16-bit preparado"),
    key: str = Form("auto"),
    scale: str = Form("chromatic"),
    strength: float = Form(100.0),
    retune_ms: float = Form(40.0),
    humanize_cents: float = Form(0.0),
) -> Response:
    """
    Afinação automática da voz (TD-PSOLA guiado pela F0).
    Devolve um novo WAV; o original não é alterado. Estatísticas no cabeçalho
    X-Autotune-Stats (JSON).
    """
    enforce_rate_limit(
        request,
        bucket="voicecheck_autotune",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    raw = await _read_limited(file)
    if not raw or raw[:4] != b"RIFF":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo inválido — envie o WAV preparado (RIFF/WAVE)",
        )
    if scale not in {"chromatic", "major", "minor", "auto"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Escala inválida")
    key_val: int | None
    if key in {"", "auto"}:
        key_val = None
    else:
        try:
            key_val = int(key)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tonalidade inválida") from exc
        if not 0 <= key_val <= 11:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tonalidade inválida")

    params = AutotuneParams(
        key=key_val,
        scale=scale,  # type: ignore[arg-type]
        strength=max(0.0, min(100.0, float(strength))) / 100.0,
        retune_ms=max(0.0, min(400.0, float(retune_ms))),
        humanize_cents=max(0.0, min(50.0, float(humanize_cents))),
    )

    try:
        result = await asyncio.to_thread(autotune_wav_bytes, raw, params)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("VoiceCheck autotune failed user=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao afinar o áudio",
        ) from exc

    return Response(
        content=result.wav_bytes,
        media_type="audio/wav",
        headers={
            "X-Autotune-Stats": json.dumps(result.stats, ensure_ascii=True, separators=(",", ":")),
            "Cache-Control": "no-store",
        },
    )

