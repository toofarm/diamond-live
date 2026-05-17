/// <reference types="cypress" />

// Far-future timestamp used to suppress the guest nudge banner during tests
// that don't explicitly care about it. Year 3000 is comfortably past any
// realistic test run; we just need any value larger than Date.now().
const NUDGE_SUPPRESS_UNTIL = 32503680000000; // Jan 1, 3000

/**
 * Visit a path with a seeded `dl_user` profile already in localStorage. The
 * profile is written inside `cy.visit`'s `onBeforeLoad` callback so it lands
 * in the target page's window *before* any of its scripts run — critically,
 * before the boot script in `app/layout.tsx` reads `prefs.theme` and before
 * the `(shell)/layout.tsx` onboarding gate evaluates `userState.status`.
 *
 * Also seeds `dl_guest_nudge_until` to a far-future timestamp so the guest
 * nudge banner (which renders for guest users with an elapsed cooldown)
 * doesn't overlay content during tests. Specs that specifically want to
 * exercise the nudge can clear that key in their own onBeforeLoad.
 *
 * Storage keys mirror `STORAGE_KEY` (lib/storage.ts) and
 * `STORAGE_KEY` (components/auth/GuestNudgeBanner.tsx).
 */
Cypress.Commands.add("visitAsUser", (path: string, fixtureName: string = "user") => {
  cy.fixture(fixtureName).then((profile) => {
    cy.visit(path, {
      onBeforeLoad(win) {
        win.localStorage.setItem("dl_user", JSON.stringify(profile));
        win.localStorage.setItem("dl_guest_nudge_until", String(NUDGE_SUPPRESS_UNTIL));
        // Defensive: a prior test in the same spec file may have set the
        // auth sentinel via visitAsAuthenticatedUser. Clear it so this
        // visit boots as a guest, not an authenticated user.
        win.localStorage.removeItem("dl_e2e_authenticated");
      },
    });
  });
});

/**
 * Visit a path with the seeded user AND an "authenticated session"
 * sentinel. Under E2E_MODE the auth store reads this sentinel and boots
 * with `status: "authenticated"`, surfacing the account/sign-out UI in
 * Settings that the guest path hides. Use this for specs that exercise
 * the post-sign-in surface.
 */
Cypress.Commands.add("visitAsAuthenticatedUser", (path: string, fixtureName: string = "user") => {
  cy.fixture(fixtureName).then((profile) => {
    cy.visit(path, {
      onBeforeLoad(win) {
        win.localStorage.setItem("dl_user", JSON.stringify(profile));
        win.localStorage.setItem("dl_guest_nudge_until", String(NUDGE_SUPPRESS_UNTIL));
        win.localStorage.setItem("dl_e2e_authenticated", "1");
      },
    });
  });
});

/**
 * Visit a path with no profile and no nudge-suppress key — the app boots
 * into the anonymous state, the shell's onboarding overlay should open at
 * step 0 (splash). Use for tests of the first-run flow.
 *
 * We explicitly remove both storage keys in `onBeforeLoad` rather than
 * relying on Cypress's per-test clean state, because if a prior test in
 * the same file seeded them they'd still be present.
 */
Cypress.Commands.add("visitAsAnonymous", (path: string) => {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.localStorage.removeItem("dl_user");
      win.localStorage.removeItem("dl_guest_nudge_until");
      win.localStorage.removeItem("dl_e2e_authenticated");
    },
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
      visitAsAuthenticatedUser(path: string, fixtureName?: string): Chainable<void>;
      visitAsAnonymous(path: string): Chainable<void>;
      mockScoreboard(fixtureName?: string): Chainable<void>;
    }
  }
}

export {};
