import pytest

from app.services.media import resolve_format, sniff_mime


def test_sniff_wav() -> None:
    header = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 20
    assert sniff_mime(header) == "audio/wav"


def test_sniff_flac() -> None:
    assert sniff_mime(b"fLaC" + b"\x00" * 20) == "audio/flac"


def test_sniff_mp3_id3() -> None:
    assert sniff_mime(b"ID3" + b"\x00" * 30) == "audio/mpeg"


def test_resolve_format_ok() -> None:
    mime, fmt = resolve_format("audio/wav", "audio/wav", "beat.wav")
    assert mime == "audio/wav"
    assert fmt == "wav"


def test_resolve_format_mismatch() -> None:
    try:
        resolve_format("audio/mpeg", "audio/wav", "x.mp3")
        assert False, "deveria falhar"
    except ValueError as exc:
        assert "não corresponde" in str(exc)


def test_sniff_formatos_novos() -> None:
    """OGG/Opus, AAC (ADTS), WebM/MKV e MOV, como os editores de vídeo aceitam."""
    assert sniff_mime(b"OggS" + b"\x00" * 20) == "audio/ogg"
    assert sniff_mime(b"\x1a\x45\xdf\xa3" + b"\x00" * 20) == "video/webm"
    assert sniff_mime(b"\xff\xf1\x50\x80" + b"\x00" * 20) == "audio/aac"
    assert sniff_mime(b"\xff\xf9\x50\x80" + b"\x00" * 20) == "audio/aac"
    assert sniff_mime(b"\xff\xfb\x90\x00" + b"\x00" * 20) == "audio/mpeg"  # MP3 continua MP3
    assert sniff_mime(b"\x00\x00\x00\x14ftypqt  " + b"\x00" * 12) == "video/mp4"  # MOV


def test_resolve_formatos_novos() -> None:
    assert resolve_format("audio/ogg", "audio/ogg", "faixa.opus") == ("audio/ogg", "ogg")
    assert resolve_format("video/webm", "video/webm", "aula.webm") == ("video/webm", "webm")
    assert resolve_format("video/x-matroska", "video/webm", "show.mkv") == ("video/webm", "webm")
    assert resolve_format("video/quicktime", "video/mp4", "clip.mov") == ("video/mp4", "mp4")
    assert resolve_format("audio/aac", "audio/aac", "voz.aac") == ("audio/aac", "aac")
    with pytest.raises(ValueError):
        resolve_format("audio/ogg", "audio/mpeg", "x.ogg")  # declarado OGG, conteúdo MP3
    with pytest.raises(ValueError):
        resolve_format("audio/ogg", "audio/ogg", "x.exe")
