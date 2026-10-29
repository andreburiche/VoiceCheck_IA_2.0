/*
 * VoiceCheck IA 2.0 — service worker da prática em casa (escopo /pratica).
 *
 * Deixa a página do paciente abrir sem internet depois da primeira visita.
 * - Página: rede primeiro, cópia guardada se estiver offline.
 * - Arquivos do Next (/_next/static, imutáveis), fontes e marca: cópia guardada primeiro.
 * - Chamadas à API nunca passam por aqui (a fila de envio fica na própria página).
 * Em desenvolvimento (?modo=dev) tudo vai à rede primeiro, para não servir código velho.
 */
const VERSAO = "vc-pratica-v1";
const MODO_DEV = new URL(self.location.href).searchParams.get("modo") === "dev";
const PAGINA = "/pratica";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const chave of await caches.keys()) {
        if (chave.startsWith("vc-pratica-") && chave !== VERSAO) await caches.delete(chave);
      }
      await self.clients.claim();
    })(),
  );
});

function mesmaOrigem(url) {
  try {
    return new URL(url, self.location.origin).origin === self.location.origin;
  } catch {
    return false;
  }
}

function eApi(url) {
  const { pathname } = new URL(url);
  return pathname.startsWith("/__api/") || pathname.startsWith("/api/");
}

/** A página avisa o que carregou (JS, CSS, fontes): na primeira visita o SW ainda não controlava. */
self.addEventListener("message", (evento) => {
  const dados = evento.data;
  if (!dados || dados.tipo !== "guardar" || !Array.isArray(dados.urls)) return;
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(VERSAO);
      const urls = [...new Set([PAGINA, ...dados.urls])].filter((u) => mesmaOrigem(u) && !eApi(new URL(u, self.location.origin).href));
      await Promise.all(
        urls.map(async (u) => {
          const chave = new URL(u, self.location.origin).pathname === PAGINA ? PAGINA : u;
          try {
            const resposta = await fetch(u, { cache: "no-cache", credentials: "same-origin" });
            if (resposta.ok) await cache.put(chave, resposta);
          } catch {
            /* sem rede agora: fica para a próxima visita */
          }
        }),
      );
      evento.source?.postMessage({ tipo: "guardado", total: urls.length });
    })(),
  );
});

async function redePrimeiro(requisicao, chave) {
  const cache = await caches.open(VERSAO);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok) await cache.put(chave, resposta.clone());
    return resposta;
  } catch (erro) {
    const guardada = await cache.match(chave);
    if (guardada) return guardada;
    throw erro;
  }
}

async function cachePrimeiro(requisicao) {
  const cache = await caches.open(VERSAO);
  const guardada = await cache.match(requisicao);
  if (guardada) return guardada;
  const resposta = await fetch(requisicao);
  if (resposta.ok) await cache.put(requisicao, resposta.clone());
  return resposta;
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET" || !mesmaOrigem(req.url) || eApi(req.url)) return;
  const { pathname } = new URL(req.url);
  if (req.mode === "navigate") {
    // o segredo do link está no "#", que nem chega aqui; a cópia guardada é uma só
    evento.respondWith(redePrimeiro(req, PAGINA));
    return;
  }
  const estatico = pathname.startsWith("/_next/static/") || pathname.startsWith("/brand/") || /\.(woff2?|ttf)$/.test(pathname);
  evento.respondWith(estatico && !MODO_DEV ? cachePrimeiro(req) : redePrimeiro(req, req));
});
