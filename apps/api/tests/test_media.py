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
