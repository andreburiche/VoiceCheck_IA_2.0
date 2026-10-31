import { expect, test } from "@playwright/test";

async function fillControlled(page: import("@playwright/test").Page, selector: string, value: string) {
  const el = page.locator(selector);
  await el.waitFor({ state: "visible", timeout: 60_000 });
  await el.click();
  await el.fill("");
  await el.pressSequentially(value, { delay: 8 });
}

test.describe("smoke auth", () => {
  test("cadastro e painel", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `e2e_${Date.now()}@example.com`;
    await page.goto("/register", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByRole("heading", { name: /Criar conta/i })).toBeVisible({ timeout: 60_000 });

    await fillControlled(page, "#name", "E2E User");
    await fillControlled(page, "#email", email);
    await fillControlled(page, "#password", "senha12345");
    await page.getByTestId("register-aceite").check();
    await expect(page.locator("#name")).toHaveValue("E2E User");

    const registerResp = page.waitForResponse(
      (r) => r.url().includes("/api/v1/auth/register") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /^Cadastrar$/i }).click();
    const resp = await registerResp;
    expect(resp.status(), await resp.text()).toBe(201);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText(/VoiceCheck IA|Bem-vindo de volta|Sua voz/i).first()).toBeVisible();
  });
});
