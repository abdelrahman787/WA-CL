import { ChatParserService } from './parsers/chat-parser.service';
import { detectDateFormat, buildDate, matchTimestampPrefix } from './parsers/date-parser.util';

describe('date-parser.util', () => {
  it('detects DMY from European timestamps', () => {
    const lines = [
      '[15/01/2021, 09:05:23] Ahmed: hi',
      '[16/01/2021, 09:07:00] Sara: hello',
    ];
    expect(detectDateFormat(lines)).toBe('DMY');
  });

  it('detects MDY when AM/PM is present', () => {
    const lines = ['[1/15/21, 9:05:23 AM] Ahmed: hi'];
    expect(detectDateFormat(lines)).toBe('MDY');
  });

  it('detects YMD when first slot is a 4-digit year', () => {
    const lines = ['[2021/01/15, 09:05:23] Ahmed: hi'];
    expect(detectDateFormat(lines)).toBe('YMD');
  });

  it('handles Arabic-Indic digits', () => {
    const m = matchTimestampPrefix('[١٥/٠١/٢٠٢١، ٠٩:٠٥:٢٣] أحمد: مرحبا');
    expect(m).not.toBeNull();
    expect(m!.a).toBe(15);
    expect(m!.b).toBe(1);
    expect(m!.c).toBe(2021);
  });

  it('converts PM correctly', () => {
    const m = matchTimestampPrefix('[1/15/21, 2:30:00 PM] Ahmed: hi')!;
    const d = buildDate(m, 'MDY');
    expect(d.getHours()).toBe(14);
  });
});

describe('ChatParserService', () => {
  const parser = new ChatParserService();

  it('parses a simple chat block', () => {
    const lines = [
      '[15/01/2021, 09:05:23] Ahmed: Good morning',
      '[15/01/2021, 09:06:00] Sara: <attached: IMG-20210115-WA0001.jpg>',
      '[15/01/2021, 09:07:00] Ahmed: ‎image omitted',
      '[15/01/2021, 09:08:00] Ahmed: This message was deleted',
    ];
    const out = parser.parseLines(lines, 'DMY');
    expect(out).toHaveLength(4);
    expect(out[0].messageType).toBe('text');
    expect(out[1].messageType).toBe('image');
    expect(out[1].attachedFileName).toBe('IMG-20210115-WA0001.jpg');
    expect(out[2].messageType).toBe('omitted');
    expect(out[3].messageType).toBe('deleted');
  });

  it('joins multi-line messages', () => {
    const lines = [
      '[15/01/2021, 09:05:23] Ahmed: line one',
      'line two continues here',
      '[15/01/2021, 09:06:00] Sara: next',
    ];
    const out = parser.parseLines(lines, 'DMY');
    expect(out).toHaveLength(2);
    expect(out[0].textContent).toContain('line two');
  });

  it('detects system messages', () => {
    const lines = [
      '[15/01/2021, 09:00:00] Messages and calls are end-to-end encrypted.',
      '[15/01/2021, 09:01:00] Ahmed created group "Family"',
    ];
    const out = parser.parseLines(lines, 'DMY');
    expect(out[0].isSystemMessage).toBe(true);
    expect(out[1].isSystemMessage).toBe(true);
  });
});
