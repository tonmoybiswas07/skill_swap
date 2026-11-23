import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionCalendar } from "../lib/calendar.ts";

test("calendar exports UTC dates and safely folds and escapes skill names", () => {
  const start = new Date("2026-12-01T18:00:00+06:00");
  const end = new Date(+start + 30 * 60_000);
  const skill = "বাংলা".repeat(10) + ", Figma; \\\nEND:VEVENT";
  const calendar = sessionCalendar({ id: "demo", skill, start, end }, start);
  const unfolded = calendar.replace(/\r\n /g, "");
  assert.match(unfolded, /\r\nDTSTART:20261201T120000Z\r\nDTEND:20261201T123000Z\r\n/);
  assert.ok(unfolded.includes(", Figma;") === false);
  assert.ok(unfolded.includes("\\, Figma\\; \\\\\\nEND:VEVENT"));
  assert.equal(unfolded.split("\r\n").filter((line) => line === "END:VEVENT").length, 1);
  assert.ok(calendar.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
});
