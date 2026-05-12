/// <reference types="cypress" />

import "./commands";

// Next.js dev-mode HMR occasionally surfaces benign errors (e.g. ResizeObserver
// loop limit exceeded). Swallow those so they don't fail the suite.
Cypress.on("uncaught:exception", (err) => {
  if (/ResizeObserver loop/i.test(err.message)) return false;
  return undefined;
});
