import type { NextConfig } from "next";

const DEV = process.env.NODE_ENV === "development";

function origem(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/**
 * Cabeçalhos de segurança de todas as páginas (a API manda os dela). A CSP corta o que um XSS
 * precisaria: carregar script de outro site, mandar dados para fora (connect-src), virar iframe
 * de outro site (clickjacking), <object>/<embed> e trocar o <base>. 'unsafe-inline' em script
 * fica por causa dos scripts inline do Next e do tema; blob: é dos AudioWorklets de gravação.
 */
function cabecalhosSeguranca() {
  const api = origem(process.env.NEXT_PUBLIC_API_URL);
  const connect = ["'self'", "blob:", api, ...(DEV ? ["ws:", "http://localhost:*", "http://127.0.0.1:*"] : [])].filter(Boolean);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' blob:${DEV ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(DEV ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // câmera (foto do paciente/profissional) e microfone (gravações) só neste site
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(DEV ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // O Next 16 em modo dev só aceita o HMR de "localhost". Sem isto, abrir o app
  // por http://127.0.0.1:3000 (como indica o compose) deixa a página sem
  // interatividade: botões e o formulário de login não respondem.
  allowedDevOrigins: ["127.0.0.1"],
  // O logo usa quality={95}; o Next 16 exige declarar as qualidades permitidas.
  images: { qualities: [75, 95] },
  // Só em desenvolvimento: espelha a API em /__api. O navegador usa este caminho
  // por padrão (mesma origem da página → cookies de sessão funcionam em
  // localhost e 127.0.0.1). Rodando o web fora do Docker, defina
  // DEV_API_PROXY_TARGET=http://127.0.0.1:8010.
  // O proxy /__api precisa esperar análises e autotune longos (padrão: 30 s).
  experimental: { proxyTimeout: 300_000, proxyClientMaxBodySize: "200mb" },
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosSeguranca() }];
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/__api/:path*", destination: `${process.env.DEV_API_PROXY_TARGET ?? "http://api:8000"}/:path*` }];
  },
};

export default nextConfig;
