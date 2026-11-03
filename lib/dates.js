// Find a submission deadline in free text. Returns "YYYY-MM-DD" or null.
// Handles: 2026-11-30, 15-11-2026, 15/11/2026, "November 30, 2026", "Nov 8th", "Sunday, November 8th @ 11:59pm PST", "30 November 2026".
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const CUE = /(deadline|ends?|closes?|closing|submit(?:ted)?\s+(?:by|before)|submissions?\s+(?:close|end|due)|due|until|last day)/i;

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

function inferYear(m, d, now) {
  const y = now.getUTCFullYear();
  // A date more than ~2 months in the past most likely means next year.
  const t = Date.UTC(y, m - 1, d);
  return t < now.getTime() - 60 * 864e5 ? y + 1 : y;
}

export function parseDate(s, now = new Date()) {
  let m;
  if ((m = s.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d)\b/))) {
    const a = +m[1], b = +m[2];
    return a > 12 ? iso(+m[3], b, a) : b > 12 ? iso(+m[3], a, b) : iso(+m[3], b, a); // day-first unless impossible
  }
  const mon = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  if ((m = s.match(new RegExp(`\\b${mon}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d\\d))?`, "i")))) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, d = +m[2];
    return iso(m[3] ? +m[3] : inferYear(mo, d, now), mo, d);
  }
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mon}\\.?(?:,?\\s+(20\\d\\d))?`, "i")))) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, d = +m[1];
    return iso(m[3] ? +m[3] : inferYear(mo, d, now), mo, d);
  }
  return null;
}

/** Look for a date shortly after a deadline cue ("Deadline:", "submit by", "closes"). */
export function findDeadline(text = "", now = new Date()) {
  const re = new RegExp(CUE.source, "gi");
  let hit;
  while ((hit = re.exec(text))) {
    const window = text.slice(hit.index, hit.index + 90);
    const d = parseDate(window, now);
    if (d) return d;
  }
  return null;
}
