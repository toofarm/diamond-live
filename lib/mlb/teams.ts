/**
 * 30-team metadata map: abbreviation → display info + MLB statsapi team id.
 * MLB team IDs are stable across seasons.
 */

export type Division =
  | "AL East" | "AL Central" | "AL West"
  | "NL East" | "NL Central" | "NL West";

export type League = "AL" | "NL";

export interface Team {
  abbr: string;
  mlbId: number;
  city: string;
  name: string;
  div: Division;
  league: League;
  primary: string;
  secondary: string;
}

export const TEAMS: Record<string, Team> = {
  // AL East
  BAL: { abbr: "BAL", mlbId: 110, city: "Baltimore", name: "Orioles",   div: "AL East", league: "AL", primary: "#DF4601", secondary: "#000000" },
  BOS: { abbr: "BOS", mlbId: 111, city: "Boston",    name: "Red Sox",   div: "AL East", league: "AL", primary: "#BD3039", secondary: "#0C2340" },
  NYY: { abbr: "NYY", mlbId: 147, city: "New York",  name: "Yankees",   div: "AL East", league: "AL", primary: "#003087", secondary: "#E4002C" },
  TB:  { abbr: "TB",  mlbId: 139, city: "Tampa Bay", name: "Rays",      div: "AL East", league: "AL", primary: "#092C5C", secondary: "#8FBCE6" },
  TOR: { abbr: "TOR", mlbId: 141, city: "Toronto",   name: "Blue Jays", div: "AL East", league: "AL", primary: "#134A8E", secondary: "#1D2D5C" },

  // AL Central
  CWS: { abbr: "CWS", mlbId: 145, city: "Chicago",     name: "White Sox",  div: "AL Central", league: "AL", primary: "#27251F", secondary: "#C4CED4" },
  CLE: { abbr: "CLE", mlbId: 114, city: "Cleveland",   name: "Guardians",  div: "AL Central", league: "AL", primary: "#00385D", secondary: "#E50022" },
  DET: { abbr: "DET", mlbId: 116, city: "Detroit",     name: "Tigers",     div: "AL Central", league: "AL", primary: "#0C2340", secondary: "#FA4616" },
  KC:  { abbr: "KC",  mlbId: 118, city: "Kansas City", name: "Royals",     div: "AL Central", league: "AL", primary: "#004687", secondary: "#BD9B60" },
  MIN: { abbr: "MIN", mlbId: 142, city: "Minnesota",   name: "Twins",      div: "AL Central", league: "AL", primary: "#002B5C", secondary: "#D31145" },

  // AL West
  HOU: { abbr: "HOU", mlbId: 117, city: "Houston",     name: "Astros",    div: "AL West", league: "AL", primary: "#002D62", secondary: "#EB6E1F" },
  LAA: { abbr: "LAA", mlbId: 108, city: "Los Angeles", name: "Angels",    div: "AL West", league: "AL", primary: "#BA0021", secondary: "#003263" },
  ATH: { abbr: "ATH", mlbId: 133, city: "Athletics",   name: "Athletics", div: "AL West", league: "AL", primary: "#003831", secondary: "#EFB21E" },
  SEA: { abbr: "SEA", mlbId: 136, city: "Seattle",     name: "Mariners",  div: "AL West", league: "AL", primary: "#0C2C56", secondary: "#005C5C" },
  TEX: { abbr: "TEX", mlbId: 140, city: "Texas",       name: "Rangers",   div: "AL West", league: "AL", primary: "#003278", secondary: "#C0111F" },

  // NL East
  ATL: { abbr: "ATL", mlbId: 144, city: "Atlanta",      name: "Braves",    div: "NL East", league: "NL", primary: "#CE1141", secondary: "#13274F" },
  MIA: { abbr: "MIA", mlbId: 146, city: "Miami",        name: "Marlins",   div: "NL East", league: "NL", primary: "#00A3E0", secondary: "#EF3340" },
  NYM: { abbr: "NYM", mlbId: 121, city: "New York",     name: "Mets",      div: "NL East", league: "NL", primary: "#FF5910", secondary: "#002D72" },
  PHI: { abbr: "PHI", mlbId: 143, city: "Philadelphia", name: "Phillies",  div: "NL East", league: "NL", primary: "#E81828", secondary: "#002D72" },
  WSH: { abbr: "WSH", mlbId: 120, city: "Washington",   name: "Nationals", div: "NL East", league: "NL", primary: "#AB0003", secondary: "#14225A" },

  // NL Central
  CHC: { abbr: "CHC", mlbId: 112, city: "Chicago",     name: "Cubs",      div: "NL Central", league: "NL", primary: "#0E3386", secondary: "#CC3433" },
  CIN: { abbr: "CIN", mlbId: 113, city: "Cincinnati",  name: "Reds",      div: "NL Central", league: "NL", primary: "#C6011F", secondary: "#000000" },
  MIL: { abbr: "MIL", mlbId: 158, city: "Milwaukee",   name: "Brewers",   div: "NL Central", league: "NL", primary: "#12284B", secondary: "#FFC52F" },
  PIT: { abbr: "PIT", mlbId: 134, city: "Pittsburgh",  name: "Pirates",   div: "NL Central", league: "NL", primary: "#FDB827", secondary: "#27251F" },
  STL: { abbr: "STL", mlbId: 138, city: "St. Louis",   name: "Cardinals", div: "NL Central", league: "NL", primary: "#C41E3A", secondary: "#0C2340" },

  // NL West
  ARI: { abbr: "ARI", mlbId: 109, city: "Arizona",       name: "D-backs",  div: "NL West", league: "NL", primary: "#A71930", secondary: "#E3D4AD" },
  COL: { abbr: "COL", mlbId: 115, city: "Colorado",      name: "Rockies",  div: "NL West", league: "NL", primary: "#33006F", secondary: "#C4CED4" },
  LAD: { abbr: "LAD", mlbId: 119, city: "Los Angeles",   name: "Dodgers",  div: "NL West", league: "NL", primary: "#005A9C", secondary: "#A5ACAF" },
  SD:  { abbr: "SD",  mlbId: 135, city: "San Diego",     name: "Padres",   div: "NL West", league: "NL", primary: "#2F241D", secondary: "#FFC425" },
  SF:  { abbr: "SF",  mlbId: 137, city: "San Francisco", name: "Giants",   div: "NL West", league: "NL", primary: "#27251F", secondary: "#FD5A1E" },
};

/** Lookup the in-app abbreviation for a given MLB team ID. */
const ID_TO_ABBR: Record<number, string> = (() => {
  const m: Record<number, string> = {};
  for (const t of Object.values(TEAMS)) m[t.mlbId] = t.abbr;
  return m;
})();

export function teamByMlbId(id: number): Team | undefined {
  const abbr = ID_TO_ABBR[id];
  return abbr ? TEAMS[abbr] : undefined;
}

export function abbrByMlbId(id: number): string | undefined {
  return ID_TO_ABBR[id];
}

export const ALL_DIVISIONS: Division[] = [
  "AL East", "AL Central", "AL West",
  "NL East", "NL Central", "NL West",
];
