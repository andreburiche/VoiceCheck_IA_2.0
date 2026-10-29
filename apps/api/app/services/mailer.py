"""Envio de e-mail simples via SMTP (sem dependências extras)."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def mail_configured() -> bool:
    return bool(get_settings().smtp_host)


def send_mail(*, to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Envia e-mail. Devolve False se o SMTP não estiver configurado ou falhar."""
    s = get_settings()
    if not s.smtp_host:
        return False
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        if s.smtp_port == 465:
            with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, context=ssl.create_default_context(), timeout=15) as smtp:
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
                if s.smtp_starttls:
                    smtp.starttls(context=ssl.create_default_context())
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password)
                smtp.send_message(msg)
        return True
    except Exception:  # noqa: BLE001 — nunca derruba a requisição
        logger.exception("Falha ao enviar e-mail para %s", to)
        return False
