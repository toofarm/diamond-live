import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    fixturesFolder: "cypress/fixtures",
  },
  // Mobile-first viewport — matches the handoff iOS frame (402×874).
  viewportWidth: 402,
  viewportHeight: 874,
  video: false,
  defaultCommandTimeout: 8000,
});
