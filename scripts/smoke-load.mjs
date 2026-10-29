#!/usr/bin/env node
/**
 * Smoke/load leve da API (sem k6).
 * Uso: node scripts/smoke-load.mjs [baseUrl] [concurrency]
 * Ex.: node scripts/smoke-load.mjs http://localhost:8000 20
 */
const base = process.argv[2] ?? process.env.PUBLIC_API_URL ?? "http://localhost:8000";
const concurrency = Number(process.argv[3] ?? 20);

async function hit(path) {
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`);
  const ms = performance.now() - t0;
  return { path, status: res.status, ms };
}

async function main() {
  const health = await hit("/health");
  if (health.status !== 200) {
    console.error("Health falhou", health);
    process.exit(1);
  }
  console.log(`health ok ${health.ms.toFixed(1)}ms`);

  const metrics = await hit("/metrics");
  console.log(`metrics ${metrics.status} ${metrics.ms.toFixed(1)}ms`);

  const jobs = Array.from({ length: concurrency }, () => hit("/health"));
  const results = await Promise.all(jobs);
  const ok = results.filter((r) => r.status === 200).length;
  const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
  const max = Math.max(...results.map((r) => r.ms));
  console.log(`parallel /health x${concurrency}: ${ok}/${concurrency} ok · avg ${avg.toFixed(1)}ms · max ${max.toFixed(1)}ms`);

  if (ok < concurrency) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
