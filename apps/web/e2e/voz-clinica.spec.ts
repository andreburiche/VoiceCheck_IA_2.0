/**
 * VoiceCheck IA 2.0 — avaliação clínica da voz, de ponta a ponta no navegador (site + API + banco).
 *
 * Roda contra o site completo (Next com o proxy /__api, cookies e CSRF de verdade):
 *   testar-v2-tela.bat            (no Windows: sobe a v2 local em Docker e roda estes testes)
 *   pnpm test:e2e e2e/voz-clinica.spec.ts   (com o site já no ar em PLAYWRIGHT_BASE_URL)
 *
 * O microfone é simulado pelo Chromium com uma vogal sintética de F0 180 Hz (fixtures/).
 * VC2_PAGINA troca a página aberta (padrão /voz-clinica).
 */
import path from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PAGINA = process.env.VC2_PAGINA ?? "/voz-clinica";
const VOGAL = path.join(__dirname, "fixtures", "vogal-180hz.wav");

test.use({
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${VOGAL}`],
  },
  permissions: ["microphone"],
});

test.describe.configure({ mode: "serial" });

let contexto: BrowserContext;
let pagina: Page;
/** Toda URL pedida ao servidor nesta bateria (o nome do paciente nunca pode aparecer nelas). */
const urls: string[] = [];
const erros: string[] = [];
const PACIENTE = `Júlia D'Ávila ${Date.now().toString(36)}`;

test.beforeAll(async ({ browser }) => {
  contexto = await browser.newContext();
  pagina = await contexto.newPage();
  pagina.on("request", (r) => urls.push(r.url()));
  pagina.on("pageerror", (e) => erros.push(String(e)));
  const email = `e2e_voz_${Date.now()}@example.com`;
  const cadastro = await contexto.request.post("/__api/api/v1/auth/register", {
    data: { email, password: "senha12345", name: "E2E Voz", perfil: "fonoaudiologo", registro: "CRFa 0-00000" },
  });
  expect(cadastro.status(), await cadastro.text()).toBe(201);
});

test.afterAll(async () => {
  await contexto?.close();
});

async function abrir(p: Page) {
  await p.goto(PAGINA, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(p.getByTestId("vc2-paciente")).toBeVisible({ timeout: 120_000 });
  await p.getByTestId("vc2-paciente").fill(PACIENTE);
}

test("grava pelo microfone, analisa e salva no histórico", async () => {
  test.setTimeout(180_000);
  await abrir(pagina);
  await pagina.getByTestId("vc2-gravar").click();
  await pagina.waitForTimeout(3000);
  await pagina.getByTestId("vc2-parar").click();
  await expect(pagina.getByTestId("vc2-analisar")).toBeEnabled({ timeout: 15_000 });
  await pagina.getByTestId("vc2-analisar").click();
  const tabela = pagina.getByTestId("vc2-tabela-acustica");
  await expect(tabela).toBeVisible({ timeout: 60_000 });
  const f0 = await tabela.getByRole("row", { name: /F0 média/ }).innerText();
  const hz = Number(/([\d.,]+)\s*Hz/.exec(f0)?.[1]?.replace(".", "").replace(",", "."));
  expect(hz, f0).toBeGreaterThan(170);
  expect(hz, f0).toBeLessThan(190);
  await expect(pagina.locator("[data-testid=vc2-historico] li")).toHaveCount(1, { timeout: 20_000 });
});

test("protocolo IDV-10 entra no histórico do mesmo paciente", async () => {
  const form = pagina.getByTestId("vc2-form-idv10");
  for (const s of await form.locator("select").all()) await s.selectOption("1");
  await form.getByRole("button", { name: "Calcular IDV-10" }).click();
  await expect(pagina.getByTestId("vc2-resumo-idv10")).toContainText("10 de 40 pontos");
  await expect(pagina.locator("[data-testid=vc2-historico] li")).toHaveCount(2, { timeout: 20_000 });
});

test("LGPD: exporta e exclui tudo do paciente", async () => {
  const download = pagina.waitForEvent("download", { timeout: 60_000 });
  await pagina.getByTestId("vc2-exportar").click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toMatch(/^voicecheck-.*\.json$/);
  await expect(pagina.getByTestId("vc2-exportar-msg")).toBeVisible();

  await pagina.getByTestId("vc2-excluir-paciente").click();
  await pagina.getByRole("button", { name: "Excluir tudo" }).click();
  await expect(pagina.getByTestId("vc2-lgpd-msg")).toContainText("2");
  await expect(pagina.getByText("Nenhuma avaliação salva ainda")).toBeVisible({ timeout: 20_000 });
});

test("o nome do paciente nunca vai na URL e a página não teve erros", async () => {
  const comNome = urls.filter((u) => /[?&]paciente=/.test(u) || decodeURIComponent(u).includes(PACIENTE));
  expect(comNome, comNome.join("\n")).toEqual([]);
  expect(urls.some((u) => u.includes("/voz-clinica/avaliacoes"))).toBe(true);
  expect(erros).toEqual([]);
});
