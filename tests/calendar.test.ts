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

test("calendar includes the accepted meeting details", () => {
  const start = new Date("2026-12-01T12:00:00Z");
  const event = { id: "demo", skill: "React", start, end: new Date(+start + 30 * 60_000) };
  assert.ok(sessionCalendar({ ...event, meeting: { kind: "campus", value: "Library, room 2" } }, start)
    .includes("LOCATION:Library\\, room 2\r\n"));
  assert.ok(sessionCalendar({ ...event, meeting: { kind: "online", value: "https://example.test/meeting" } }, start)
    .includes("URL:https://example.test/meeting\r\n"));
});
