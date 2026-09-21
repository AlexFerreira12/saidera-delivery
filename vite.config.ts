// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        manifest: false,
        workbox: {
          // Só a casca do app e arquivos públicos entram no cache.
          globPatterns: ["**/*.{js,css,ico,png,svg,webp,woff2}", "offline.html"],
          navigateFallback: "/offline.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/~oauth/, /^\/admin/, /^\/entregador/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              // Navegações sempre tentam a rede primeiro; nada autenticado é guardado.
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "paginas",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
                sameOrigin && url.pathname.startsWith("/api/public/imagem/"),
              handler: "CacheFirst",
              options: {
                cacheName: "imagens-catalogo",
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
  },
});
