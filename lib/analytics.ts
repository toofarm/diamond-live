export const events = {
  LOGIN: "login",
  SIGNUP: "sign_up",
  LOGOUT: "logout",
  CONTINUE_AS_GUEST: "continue_as_guest",
  TAB_NAVIGATION: "tab_navigation",
  PLAYER_COMPARISON: "player_comparison",
  TEAM_COMPARISON: "team_comparison",
  TEAM_SELECTION: "team_selection",
  CALENDAR_NAVIGATION: "calendar_navigation",
  THEME_CHANGE: "theme_change",
} as const;

type dataLayerEvent = {
  event: (typeof events)[keyof typeof events];
  target?: string;
  meta?: Record<string, string>;
};

/**
 * Push an event onto the GTM dataLayer. No-op on the server: the dataLayer
 * is a browser-only construct (`window.dataLayer`), so callers in server
 * actions or RSCs silently do nothing rather than throwing on `window`.
 * Server-side calls would otherwise crash the request — callers that need
 * the event recorded must fire it from a client component.
 *
 * `window.dataLayer` is declared by `@next/third-parties` as `Object[]`, so
 * we initialize and push through that typing rather than re-declaring it.
 */
export const sendToDataLayer = (event: dataLayerEvent): void => {
  if (typeof window === "undefined") return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(event);
};
