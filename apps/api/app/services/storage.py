"""Adapters de armazenamento: local (dev) e S3-compatible."""

from __future__ import annotations

import hashlib
import hmac
import time
from abc import ABC, abstractmethod
from pathlib import Path
from urllib.parse import quote, urlencode

import boto3
from botocore.client import Config

from app.core.config import Settings, get_settings


class StorageAdapter(ABC):
    @abstractmethod
    def ensure_ready(self) -> None: ...

    @abstractmethod
    def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...

    @abstractmethod
    def get_bytes(self, key: str) -> bytes: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def size(self, key: str) -> int: ...

    @abstractmethod
    def upload_url(self, key: str, content_type: str, ttl_seconds: int) -> str:
        """URL para o cliente enviar o arquivo (PUT)."""

    @abstractmethod
    def download_url(self, key: str, ttl_seconds: int, filename: str | None = None) -> str:
        """URL temporária de leitura."""


class LocalStorageAdapter(StorageAdapter):
    """Armazena em disco; upload/download passam pela API com assinatura HMAC."""

    def __init__(self, root: Path, public_api_url: str, signing_secret: str) -> None:
        self.root = root
        self.public_api_url = public_api_url.rstrip("/")
        self.signing_secret = signing_secret.encode("utf-8")

    def ensure_ready(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        safe = key.replace("\\", "/").lstrip("/")
        if ".." in safe.split("/"):
            raise ValueError("storage key inválida")
        path = (self.root / safe).resolve()
        if not str(path).startswith(str(self.root.resolve())):
            raise ValueError("path traversal bloqueado")
        return path

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        meta = path.with_suffix(path.suffix + ".meta")
        meta.write_text(content_type, encoding="utf-8")

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()
        meta = path.with_suffix(path.suffix + ".meta")
        if meta.is_file():
            meta.unlink()

    def size(self, key: str) -> int:
        return self._path(key).stat().st_size

    def _sign(self, key: str, exp: int, purpose: str, filename: str | None = None) -> str:
        msg = f"{purpose}:{key}:{exp}".encode("utf-8")
        if filename:
            # filename entra na assinatura para não poder ser trocado na URL
            msg += b":" + filename.encode("utf-8")
        return hmac.new(self.signing_secret, msg, hashlib.sha256).hexdigest()

    def verify_signature(
        self, key: str, exp: int, purpose: str, signature: str, filename: str | None = None
    ) -> bool:
        if exp < int(time.time()):
            return False
        expected = self._sign(key, exp, purpose, filename)
        return hmac.compare_digest(expected, signature)

    def upload_url(self, key: str, content_type: str, ttl_seconds: int) -> str:
        exp = int(time.time()) + ttl_seconds
        sig = self._sign(key, exp, "upload")
        qs = urlencode({"key": key, "exp": exp, "sig": sig, "ct": content_type})
        return f"{self.public_api_url}/api/v1/uploads/local?{qs}"

    def download_url(self, key: str, ttl_seconds: int, filename: str | None = None) -> str:
        exp = int(time.time()) + ttl_seconds
        sig = self._sign(key, exp, "download", filename)
        params: dict[str, str | int] = {"key": key, "exp": exp, "sig": sig}
        if filename:
            params["filename"] = filename
        return f"{self.public_api_url}/api/v1/audio-assets/local-download?{urlencode(params)}"


class S3StorageAdapter(StorageAdapter):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self.public_client = boto3.client(
            "s3",
            endpoint_url=settings.s3_public_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self.bucket = settings.s3_bucket

    def ensure_ready(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:
            self.client.create_bucket(Bucket=self.bucket)

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def get_bytes(self, key: str) -> bytes:
        obj = self.client.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def size(self, key: str) -> int:
        head = self.client.head_object(Bucket=self.bucket, Key=key)
        return int(head["ContentLength"])

    def upload_url(self, key: str, content_type: str, ttl_seconds: int) -> str:
        return self.public_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=ttl_seconds,
            HttpMethod="PUT",
        )

    def download_url(self, key: str, ttl_seconds: int, filename: str | None = None) -> str:
        params: dict = {"Bucket": self.bucket, "Key": key}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{quote(filename)}"'
        return self.public_client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=ttl_seconds,
        )


_storage: StorageAdapter | None = None


def get_storage() -> StorageAdapter:
    global _storage
    if _storage is not None:
        return _storage
    settings = get_settings()
    backend = settings.storage_backend.lower()
    if backend == "local":
        _storage = LocalStorageAdapter(
            root=Path(settings.local_storage_path),
            public_api_url=settings.public_api_url,
            signing_secret=settings.jwt_secret,
        )
    elif backend == "s3":
        _storage = S3StorageAdapter(settings)
    else:
        raise RuntimeError(f"STORAGE_BACKEND inválido: {backend}")
    _storage.ensure_ready()
    return _storage
