import { test, expect } from "@playwright/test";

test.describe("vitrine pública", () => {
  test("home carrega o catálogo", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Bebidas|Guariba|Categorias|Destaques/i);
  });

  test("carrinho vazio é acessível sem login", async ({ page }) => {
    await page.goto("/carrinho", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/carrinho/i);
  });

  test("área do painel exige login", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth|\/$/);
  });

  test("área do entregador exige login", async ({ page }) => {
    await page.goto("/entregador", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth|\/$/);
  });

  test("páginas privadas não são indexáveis", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    const body = await robots.text();
    for (const path of ["/admin", "/entregador", "/pagamento/", "/conta"]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
  });

  test("aviso de pagamento recusa chamada sem credencial", async ({ request }) => {
    const res = await request.post("/api/public/webhooks/pagarme", {
      data: { type: "order.paid" },
      failOnStatusCode: false,
    });
    expect([401, 403, 429, 503]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });
});
