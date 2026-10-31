from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Valores de exemplo que nunca podem chegar a produção.
_INSECURE_SECRETS = {
    "change_me_to_a_long_random_secret_at_least_32_chars",
    "change_me_csrf_secret_also_long_random",
    "minioadmin",
}
# Ambientes onde as contas de teste (senha pública) podem ser criadas.
_DEV_ENVS = {"development", "dev", "local", "test"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    #: Sem APP_ENV definido, vale produção: falha fechada (exige segredos fortes, cookie Secure e não cria
    #: contas de teste). O ambiente local declara APP_ENV=development no docker-compose.
    app_env: str = "production"
    app_name: str = "Estúdio Musical"
    public_web_url: str = "http://localhost:3000"
    public_api_url: str = "http://localhost:8000"

    database_url: str = "mysql+pymysql://estudio:change_me_dev_only@127.0.0.1:3307/estudio_musical"
    redis_url: str = "redis://127.0.0.1:6379/0"
    celery_broker_url: str = "redis://127.0.0.1:6379/0"

    jwt_secret: str = "change_me_to_a_long_random_secret_at_least_32_chars"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    cookie_secure: bool = False
    cookie_domain: str = "localhost"
    csrf_secret: str = "change_me_csrf_secret_also_long_random"

    cors_origins: str = "http://localhost:3000"

    storage_backend: str = "local"  # local | s3
    local_storage_path: str = "/data/audio"

    s3_endpoint_url: str = "http://127.0.0.1:9000"
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "estudio-audio"
    s3_region: str = "us-east-1"
    s3_presign_ttl_seconds: int = 300

    max_upload_bytes: int = 104_857_600
    max_duration_seconds: int = 600
    default_plan_code: str = "free"
    # Cotas do plano free (local-first: stems WAV ocupam bastante disco)
    default_max_storage_mb: int = 10_240
    default_max_minutes_month: int = 600
    default_max_concurrent_jobs: int = 2

    separation_adapter: str = "contract"
    allow_contract_stems: bool = False

    # Rate limits (0 = desligado). Janela em segundos.
    rate_limit_auth: int = 20
    #: Tentativas de login por conta (qualquer IP) em 15 minutos.
    rate_limit_login_conta: int = 10
    rate_limit_auth_window_sec: int = 60
    rate_limit_upload: int = 30
    rate_limit_upload_window_sec: int = 60
    # IPs de proxies reversos confiáveis (separados por vírgula). Só deles o
    # X-Forwarded-For é aceito; vazio = usar sempre o IP da conexão.
    trusted_proxies: str = ""

    # VoiceCheck: jobs abandonados (arquivos temporários) são apagados após N horas.
    # 0 = nunca apagar.
    voicecheck_job_ttl_hours: float = 24

    # /metrics: se definido, exige "Authorization: Bearer <token>".
    # Em produção sem token, /metrics fica desativado (404).
    metrics_token: str = ""

    # E-mail (SMTP) — usado no "esqueci minha senha". Sem SMTP_HOST, nenhum
    # e-mail sai; em desenvolvimento o link aparece na tela e no log.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "VoiceCheck IA <no-reply@localhost>"
    smtp_starttls: bool = True
    password_reset_ttl_minutes: int = 30

    # IA de texto (aba Documentos: melhorar, corrigir, simplificar, redigir).
    # desligado (padrão) | anthropic (Claude, precisa de ANTHROPIC_API_KEY) | ollama (modelo local).
    # O nome do paciente nunca é enviado: a tela troca por [PACIENTE] antes.
    ia_texto_provedor: str = "desligado"
    ia_texto_modelo: str = ""  # vazio = padrão do provedor
    anthropic_api_key: str = ""
    ollama_url: str = "http://host.docker.internal:11434"
    # provedor "openai": serviço compatível (LM Studio, Groq, OpenRouter...)
    ia_texto_url: str = ""
    ia_texto_chave: str = ""
    #: Provedor de IA fora deste computador/servidor (Anthropic, OpenAI-compatível na internet) recebe
    #: texto de documento clínico: transferência de dado de saúde (LGPD art. 11 e 33). Só liga com
    #: este aceite explícito, depois de contrato com o provedor e informação ao paciente.
    ia_texto_transferencia_autorizada: bool = False

    @model_validator(mode="after")
    def _check_production_secrets(self) -> "Settings":
        if not self.is_production:
            return self
        problems: list[str] = []
        for name in ("jwt_secret", "csrf_secret"):
            value = getattr(self, name)
            if value in _INSECURE_SECRETS or len(value) < 32:
                problems.append(f"{name.upper()} fraco ou de exemplo (use ≥32 caracteres aleatórios)")
        if self.storage_backend.lower() == "s3" and self.s3_secret_key in _INSECURE_SECRETS:
            problems.append("S3_SECRET_KEY de exemplo")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE deve ser true")
        if self.allow_contract_stems:
            problems.append("ALLOW_CONTRACT_STEMS deve ser 0")
        if problems:
            raise ValueError("Configuração insegura para produção: " + "; ".join(problems))
        return self

    @property
    def trusted_proxy_list(self) -> set[str]:
        return {p.strip() for p in self.trusted_proxies.split(",") if p.strip()}

    @property
    def seed_dev_users(self) -> bool:
        return self.app_env.lower() in _DEV_ENVS

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
