import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Run from apps/web:  pnpm exec vitest run --config ../../redteam/f133/vitest.config.ts
const web = fileURLToPath(new URL("../../apps/web/", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": web.replace(/\/$/, ""), "server-only": fileURLToPath(new URL("./empty.ts", import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
  test: { include: ["*.test.ts"] },
});
