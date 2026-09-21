import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Cabeçalhos de segurança aplicados a todas as respostas HTML.
 * A política de conteúdo entra em modo de observação (Report-Only) para não
 * quebrar recursos legítimos antes de ser promovida a bloqueio.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https: wss:",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), payment=(), geolocation=(self)");
  headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  if ((headers.get("content-type") ?? "").includes("text/html")) {
    headers.set("content-security-policy-report-only", CSP_REPORT_ONLY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Identificador de requisição: permite ligar um erro do cliente ao log do
    // servidor sem registrar dados pessoais, PIN, QR ou segredos.
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const safe = withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
      safe.headers.set("x-request-id", requestId);
      return safe;
    } catch (error) {
      console.error("ssr_error", requestId, new URL(request.url).pathname, error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8", "x-request-id": requestId },
      });
    }
  },
};
