import type { NextConfig } from "next";

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
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/__api/:path*", destination: `${process.env.DEV_API_PROXY_TARGET ?? "http://api:8000"}/:path*` }];
  },
};

export default nextConfig;
