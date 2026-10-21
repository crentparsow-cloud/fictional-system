import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Components are rendered in a few tests (the /dev/kit snapshot); tsconfig keeps jsx as "preserve" for Next.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
  },
});
