/** Date helpers — all dates use the user's local timezone for display. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DateStripEntry {
  iso: string;     // YYYY-MM-DD
  d: string;       // day-of-month
  m: string;       // month short
  wd: string;      // weekday uppercase
  today: boolean;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function dateStrip(centerDaysAhead = 0, daysBefore = 7, daysAfter = 7): DateStripEntry[] {
  const todayIso = todayISO();
  const center = addDays(new Date(), centerDaysAhead);
  const out: DateStripEntry[] = [];
  for (let i = -daysBefore; i <= daysAfter; i++) {
    const d = addDays(center, i);
    out.push({
      iso: toISO(d),
      d: String(d.getDate()),
      m: MONTHS[d.getMonth()],
      wd: WEEKDAYS[d.getDay()],
      today: toISO(d) === todayIso,
    });
  }
  return out;
}

export function formatDateLabel(iso: string): { wd: string; mo: string; dom: number } {
  const d = fromISO(iso);
  return { wd: WEEKDAYS_SHORT[d.getDay()], mo: MONTHS[d.getMonth()], dom: d.getDate() };
}

export function formatTodayHeader(): string {
  const d = new Date();
  return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()].toUpperCase()} ${d.getDate()} · ${d.getFullYear()}`;
}

/** Current MLB season year (the regular season runs Mar–Oct). */
export function currentSeason(): number {
  const now = new Date();
  // Offseason (Nov–Feb): show the previous season's data, which is the last completed season.
  const month = now.getMonth(); // 0-indexed
  if (month <= 1) return now.getFullYear() - 1;       // Jan, Feb
  return now.getFullYear();
}
