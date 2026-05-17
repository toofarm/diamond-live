/// <reference types="cypress" />

import "./commands";

// Next.js dev-mode HMR occasionally surfaces benign errors (e.g. ResizeObserver
// loop limit exceeded). Swallow those so they don't fail the suite.
//
// NEXT_REDIRECT is the sentinel error Next.js throws from a server action to
// commit a redirect — the framework catches and resolves it normally, but
// Cypress's uncaught-exception watcher sees it briefly before that handling
// runs. Treat it as benign so specs that click through a `redirect()`-bearing
// server action (e.g. sign-out) don't fail with a false-positive.
Cypress.on("uncaught:exception", (err) => {
  if (/ResizeObserver loop/i.test(err.message)) return false;
  if (/NEXT_REDIRECT/.test(err.message)) return false;
  return undefined;
});
