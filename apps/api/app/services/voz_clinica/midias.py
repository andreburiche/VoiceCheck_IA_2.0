"""Mídias do paciente (imagens e vídeos), como o gerenciamento de mídias do iVox.

O tipo vem do conteúdo do arquivo (assinatura dos primeiros bytes), nunca do nome nem do
Content-Type enviado: assim um HTML ou SVG disfarçado de imagem é recusado. SVG fica de fora
de propósito (pode levar script).
"""

from __future__ import annotations

import re
import unicodedata

LIMITE_IMAGEM = 15 * 1024 * 1024
LIMITE_VIDEO = 100 * 1024 * 1024


class ErroMidia(ValueError):
    """Arquivo recusado (tipo ou tamanho)."""


def detectar(dados: bytes) -> tuple[str, str, str]:
    """Devolve (categoria, mime, extensão) pela assinatura do arquivo."""
    if dados[:3] == b"\xff\xd8\xff":
        return "imagem", "image/jpeg", "jpg"
    if dados[:8] == b"\x89PNG\r\n\x1a\n":
        return "imagem", "image/png", "png"
    if dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        return "imagem", "image/webp", "webp"
    if dados[4:8] == b"ftyp":
        marca = dados[8:12]
        if marca == b"qt  ":
            return "video", "video/quicktime", "mov"
        if marca[:3] in (b"hei", b"mif", b"avi"):  # HEIC/AVIF usam o mesmo contêiner
            raise ErroMidia("Formato de imagem HEIC/AVIF não aceito: envie em JPG ou PNG.")
        return "video", "video/mp4", "mp4"
    if dados[:4] == b"\x1a\x45\xdf\xa3":
        return "video", "video/webm", "webm"
    raise ErroMidia("Tipo de arquivo não aceito: envie imagem (JPG, PNG, WebP) ou vídeo (MP4, MOV, WebM).")


def validar(dados: bytes) -> tuple[str, str, str]:
    categoria, mime, ext = detectar(dados)
    limite = LIMITE_IMAGEM if categoria == "imagem" else LIMITE_VIDEO
    if len(dados) > limite:
        raise ErroMidia(f"{'Imagem' if categoria == 'imagem' else 'Vídeo'} maior que {limite // (1024 * 1024)} MB.")
    if len(dados) < 64:
        raise ErroMidia("Arquivo vazio ou incompleto.")
    return categoria, mime, ext


def nome_seguro(nome: str | None) -> str | None:
    """Nome original só para exibição: sem caminho, sem caracteres de controle, até 120."""
    if not nome:
        return None
    nome = unicodedata.normalize("NFC", nome).replace("\\", "/").rsplit("/", 1)[-1]
    nome = re.sub(r"[\x00-\x1f\x7f]", "", nome).strip()
    return nome[:120] or None
