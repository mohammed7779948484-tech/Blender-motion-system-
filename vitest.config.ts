import { defineConfig } from "vitest/config";

// Only this checkout's tests (agent worktrees under .claude/ carry their own copies).
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], exclude: ["node_modules/**", ".claude/**", "out/**"] },
});
