/// <reference types="cypress" />

/**
 * Visit a path with a seeded `dl_user` profile already in localStorage. The
 * profile is written inside `cy.visit`'s `onBeforeLoad` callback so it lands
 * in the target page's window *before* any of its scripts run — critically,
 * before the boot script in `app/layout.tsx` reads `prefs.theme` and before
 * the `(shell)/layout.tsx` onboarding gate evaluates `user == null`.
 *
 * The storage key `"dl_user"` mirrors `STORAGE_KEY` from `lib/storage.ts`.
 */
Cypress.Commands.add("visitAsUser", (path: string, fixtureName: string = "user") => {
  cy.fixture(fixtureName).then((profile) => {
    cy.visit(path, {
      onBeforeLoad(win) {
        win.localStorage.setItem("dl_user", JSON.stringify(profile));
      },
    });
  });
});

/**
 * Intercept every /api/mlb/scoreboard call (initial fetch + the 20s poll) with
 * a fixture payload. Aliased so specs can `cy.wait("@scoreboard")` on first
 * render. The wildcard pattern matches any ?date=... query so tests don't have
 * to freeze the clock.
 */
Cypress.Commands.add("mockScoreboard", (fixtureName: string = "scoreboard-today") => {
  cy.intercept("GET", "/api/mlb/scoreboard*", { fixture: fixtureName }).as("scoreboard");
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      visitAsUser(path: string, fixtureName?: string): Chainable<void>;
      mockScoreboard(fixtureName?: string): Chainable<void>;
    }
  }
}

export {};
