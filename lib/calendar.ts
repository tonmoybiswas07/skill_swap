function calendarDate(date: Date) {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

function calendarText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&");
}

function fold(line: string) {
  const segments: string[] = [];
  let segment = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > 75) {
      segments.push(segment);
      segment = " ";
      bytes = 1;
    }
    segment += char;
    bytes += size;
  }
  segments.push(segment);
  return segments.join("\r\n");
}

export function sessionCalendar(event: { id: string; skill: string; start: Date; end: Date }, stamp: Date) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SkillSwap Ledger//Sessions//EN",
    "BEGIN:VEVENT",
    `UID:${event.id}@skillswap-ledger`,
    `DTSTAMP:${calendarDate(stamp)}`,
    `DTSTART:${calendarDate(event.start)}`,
    `DTEND:${calendarDate(event.end)}`,
    `SUMMARY:${calendarText(`SkillSwap · ${event.skill}`)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].map(fold).join("\r\n");
}
