"""Headers de segurança HTTP (middleware ASGI leve)."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings


#: Cabeçalho Range com muitos intervalos: o analisador do Starlette 0.41 (FileResponse) gasta tempo
#: quadrático nele (CVE-2025-62727, negação de serviço). Players de áudio pedem 1 intervalo.
MAX_RANGE_CHARS = 200
MAX_RANGE_INTERVALOS = 5


def range_abusivo(valor: str | None) -> bool:
    return bool(valor) and (len(valor) > MAX_RANGE_CHARS or valor.count(",") >= MAX_RANGE_INTERVALOS)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if range_abusivo(request.headers.get("range")):
            response = Response(status_code=416, content=b"Range invalido")
        else:
            response = await call_next(request)
        settings = get_settings()
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # respostas da API trazem dados de pacientes: nada de cache em proxies ou no disco do navegador
        if request.url.path.startswith("/api/v1/voz-clinica"):
            response.headers.setdefault("Cache-Control", "no-store")
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response
