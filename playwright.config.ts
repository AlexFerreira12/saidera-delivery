import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra o servidor de desenvolvimento local.
 * Nenhum teste toca produção nem cria cobrança real: o provedor de pagamento
 * é simulado (sem chaves configuradas o PIX é recusado pelo servidor).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:8080",
    trace: "off",
    viewport: { width: 390, height: 844 },
    // Usa o Chromium já disponível no ambiente quando informado.
    launchOptions: process.env["E2E_CHROMIUM"]
      ? { executablePath: process.env["E2E_CHROMIUM"] }
      : {},
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 5"] } }],
});
