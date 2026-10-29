# 05 — Checklist DevOps / Infraestrutura

Itens **não** aplicáveis apenas pelo repositório. Validar no ambiente real.

## Node.js / containers web

- [ ] Confirmar versão em todos os hosts: `node -v` ≥ **24.22.1** (ou ≥ **22.23.4** na linha 22).
- [ ] `docker pull node:24.22.1-alpine` e rebuild `web`.
- [ ] Registrar digest da imagem em uso.
- [ ] Atualizar runners CI self-hosted, se houver.
- [ ] Reiniciar processos Next.js / Node após upgrade.
- [ ] Verificar se reverse proxy envia/aceita `Content-Encoding: br` e se o app decodifica Brotli.

## PHP (host XAMPP / outros)

> A aplicação do monorepo **não usa PHP**. Este bloco aplica-se ao **host** ou a outros vhosts no mesmo servidor.

- [ ] Inventariar serviços PHP expostos (`httpd`, IIS, php-fpm).
- [ ] Atualizar PHP para **≥ 8.3.36** (ou 8.2.35 / 8.4.27 / 8.5.12 conforme branch).
- [ ] Em `php.ini`: `session.upload_progress.enabled=Off` (explícito) e reiniciar Apache/PHP-FPM.
- [ ] Se PHP não for necessário neste host: desabilitar serviço.
- [ ] Não considerar mitigação de `upload_progress` como substituto do patch.

## Python (api / worker)

- [ ] No container: `pip list` filtrar `brotli` / `brotlicffi`.
- [ ] Executar `pip-audit` (ou equivalente) nas imagens `api` e `worker`.
- [ ] Se vulnerável: pin `brotli>=1.2.1` / `brotlicffi>=1.2.1.0`, rebuild.
- [ ] Confirmar que não há decode Brotli customizado em código de terceiros.

## Produção / rede

- [ ] `COOKIE_SECURE=true` atrás de HTTPS.
- [ ] Secrets fortes (JWT/CSRF) — nunca placeholders do `.env.example`.
- [ ] Desabilitar seed `_DEV_TEST_USERS` / garantir `APP_ENV=production`.
- [ ] Portas: API não publicada publicamente sem auth/WAF; MinIO interno.
- [ ] TLS 1.2+; HTTP/2 apenas com stacks atualizados.
- [ ] Backup e plano de rollback de imagens antes do deploy.

## Homologação

- [ ] Smoke: login, upload, VoiceCheck analyze, health `/health`.
- [ ] Monitorar crash de Node/PHP workers após deploy.
