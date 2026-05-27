/**
 * Shared pitch-type metadata. Code → display name and code → fill color
 * mappings used by every UI surface that visualizes pitch arsenals
 * (PitchUsageCard in GameDetail, PitchArsenalChart in PlayerDetail, etc.).
 *
 * Kept in one place so a new color or a new pitch code only needs to be
 * added once. Codes follow the MLB Statcast pitch_type taxonomy.
 */

export const PITCH_TYPE_NAMES: Record<string, string> = {
  FF: "4-Seam", FT: "2-Seam", FA: "Fastball", SI: "Sinker",
  SL: "Slider", ST: "Sweeper", SV: "Slurve",
  CB: "Curve", CU: "Curve", CS: "Slow Curve", KC: "Knuckle",
  CH: "Changeup",
  CT: "Cutter", FC: "Cutter", FS: "Splitter",
  EP: "Eephus", FO: "Forkball", UN: "Unknown",
};

/** Color per pitch type. Families share a hue (all fastballs rust, all
 *  curves purple) so a viewer can read pitch family at a glance even
 *  without remembering exact codes. */
export const PITCH_USAGE_COLORS: Record<string, string> = {
  FF: "#B83A2A", // 4-Seam — rust red (fastball family)
  FT: "#B83A2A", // 2-Seam
  FA: "#B83A2A", // generic Fastball
  SI: "#D97C2A", // Sinker — orange
  SL: "#2F6BD9", // Slider — cobalt
  ST: "#3FA0B5", // Sweeper — teal (slider variant, but visually distinct
                 //   from base slider per Statcast convention)
  SV: "#5B3DAA", // Slurve — purple (closer to curve than slider)
  FS: "#5DA3DA", // Splitter — sky blue
  CT: "#B95A92", // Cutter — magenta
  FC: "#B95A92",
  CB: "#5B3DAA", // Curve — purple (whole curve family shares the hue)
  CU: "#5B3DAA",
  CS: "#5B3DAA", // Slow Curve
  KC: "#5B3DAA", // Knuckle Curve
  CH: "#2E9D5B", // Changeup — green
  EP: "#8A8077",
  FO: "#8A8077",
};

/** Fallback for unknown / new pitch codes — a neutral tone that won't
 *  collide with any color in the family palette above. */
export const PITCH_FALLBACK_COLOR = "#8A8077";

export function pitchColor(code: string): string {
  return PITCH_USAGE_COLORS[code] ?? PITCH_FALLBACK_COLOR;
}

export function pitchName(code: string): string {
  return PITCH_TYPE_NAMES[code] ?? code;
}
