/**
 * WhatsApp _chat.txt timestamps appear in several locale-specific formats.
 * We auto-detect from the first N timestamped lines so the rest of the
 * parser can stay format-agnostic.
 */

export type DateFormat = 'DMY' | 'MDY' | 'YMD';

// Arabic-Indic digit translation (U+0660..U+0669 → 0..9).
const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) out += ARABIC_DIGITS[ch] ?? ch;
  return out;
}

// Strip the LRM (U+200E) / RLM (U+200F) marks WhatsApp inserts.
export function stripBidiMarks(input: string): string {
  return input.replace(/[‎‏‪-‮]/g, '');
}

/**
 * Regex matches the timestamp prefix of a WA chat line.
 *   [DD/MM/YYYY, HH:MM:SS]      EU/Arabic
 *   [M/D/YY, H:MM:SS AM/PM]    US
 *   [YYYY/MM/DD, HH:MM:SS]      JP / KR
 * The bracket characters and the comma may also be the unicode variants.
 */
const TIMESTAMP_RE =
  /^\[?\s*(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})[,،]?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?\s*\]?\s*[-–:]?\s*/i;

export interface RawTimestampMatch {
  a: number; // first numeric group
  b: number; // second
  c: number; // third
  hour: number;
  minute: number;
  second: number;
  meridiem: 'AM' | 'PM' | null;
  rawPrefix: string;
  rest: string;
}

export function matchTimestampPrefix(line: string): RawTimestampMatch | null {
  const normalized = normalizeDigits(stripBidiMarks(line));
  const m = TIMESTAMP_RE.exec(normalized);
  if (!m) return null;
  const meridiem = m[7]
    ? (m[7].toUpperCase() === 'AM' ? 'AM' : 'PM')
    : null;
  return {
    a: parseInt(m[1], 10),
    b: parseInt(m[2], 10),
    c: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10),
    second: m[6] ? parseInt(m[6], 10) : 0,
    meridiem,
    rawPrefix: m[0],
    rest: normalized.slice(m[0].length),
  };
}

/**
 * Pick DMY / MDY / YMD from a sample. Rules:
 *  - If any tuple has a > 31 → it must be a year → YMD.
 *  - If any tuple has b > 12 → b is a day → MDY would put month in b,
 *    contradiction → fall back to DMY.
 *  - If any tuple has a > 12 → a is a day → DMY.
 *  - Otherwise default to DMY (more common globally).
 */
export function detectDateFormat(sampleLines: string[]): DateFormat {
  let dmyVotes = 0;
  let mdyVotes = 0;
  for (const line of sampleLines) {
    const m = matchTimestampPrefix(line);
    if (!m) continue;
    if (m.a > 31 || m.a >= 1000) return 'YMD';
    // If b > 12, b can only be a day-of-month → a is the month → MDY.
    // If a > 12, a is a day → DMY.
    if (m.b > 12) mdyVotes += 2;
    if (m.a > 12) dmyVotes += 2;
    if (m.meridiem) mdyVotes++;
  }
  return mdyVotes > dmyVotes ? 'MDY' : 'DMY';
}

export function buildDate(m: RawTimestampMatch, fmt: DateFormat): Date {
  let day: number, month: number, year: number;
  switch (fmt) {
    case 'YMD': year = m.a; month = m.b; day = m.c; break;
    case 'MDY': month = m.a; day = m.b; year = m.c; break;
    case 'DMY': default: day = m.a; month = m.b; year = m.c; break;
  }
  // 2-digit year heuristic (00-79 → 2000-2079, 80-99 → 1980-1999)
  if (year < 100) year += year < 80 ? 2000 : 1900;
  let hour = m.hour;
  if (m.meridiem === 'PM' && hour < 12) hour += 12;
  if (m.meridiem === 'AM' && hour === 12) hour = 0;
  return new Date(year, month - 1, day, hour, m.minute, m.second);
}
