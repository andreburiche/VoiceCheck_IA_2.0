from app.core.security import create_access_token, hash_password, safe_decode_access_token, verify_password


def test_password_hash_roundtrip() -> None:
    hashed = hash_password("senha-segura-123")
    assert verify_password("senha-segura-123", hashed)
    assert not verify_password("outra", hashed)


def test_jwt_roundtrip() -> None:
    token = create_access_token(subject="user-1", extra={"role": "user"})
    payload = safe_decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user-1"
    assert payload["role"] == "user"


def test_jwt_invalid() -> None:
    assert safe_decode_access_token("not.a.token") is None
