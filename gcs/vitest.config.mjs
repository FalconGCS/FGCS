import { defineConfig } from "vitest/config"

// Unit tests for helpers. The end to end specs under tests/ are Playwright's,
// so they are deliberately left out of this include.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{js,jsx}"],
    environment: "node",
  },
})
