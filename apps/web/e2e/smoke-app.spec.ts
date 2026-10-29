import { expect, test } from "@playwright/test";

async function fillControlled(page: import("@playwright/test").Page, selector: string, value: string) {
  const el = page.locator(selector);
  await el.waitFor({ state: "visible", timeout: 60_000 });
  await el.click();
  await el.fill("");
  await el.pressSequentially(value, { delay: 8 });
}

test.describe("smoke app autenticado", () => {
  test("cadastro → projetos → criar projeto", async ({ page }) => {
    test.setTimeout(150_000);
    const email = `e2e_app_${Date.now()}@example.com`;

    await page.goto("/register", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /Criar conta/i })).toBeVisible({ timeout: 60_000 });
    await fillControlled(page, "#name", "E2E App");
    await fillControlled(page, "#email", email);
    await fillControlled(page, "#password", "senha12345");
    const reg = page.waitForResponse((r) => r.url().includes("/auth/register") && r.request().method() === "POST");
    await page.getByRole("button", { name: /^Cadastrar$/i }).click();
    expect((await reg).status()).toBe(201);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await expect(page.getByRole("link", { name: /Ir para o conteúdo/i })).toHaveCount(1);

    await page.getByRole("link", { name: /Meus Projetos|Projetos/i }).first().click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /^Projetos$/i })).toBeVisible();

    const projectName = `Projeto E2E ${Date.now()}`;
    await fillControlled(page, "#name", projectName);

    const create = page.waitForResponse(
      (r) => r.url().includes("/api/v1/projects") && r.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /^Criar projeto$/i }).click();
    const created = await create;
    expect(created.status(), await created.text()).toBe(201);

    await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 15_000 });
  });
});
