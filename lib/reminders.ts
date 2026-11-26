import { ObjectId } from "mongodb";
import { collections } from "./booking.ts";
import { getDatabase } from "./db.ts";

const hour = 60 * 60_000;

export async function sendSessionReminders(now = new Date()) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SESSION_REMINDER_FROM;
  if (!from) return;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!apiKey || !baseURL) throw new Error("Set RESEND_API_KEY and BETTER_AUTH_URL for session email reminders.");

  const { bookings } = collections();
  const users = getDatabase().db.collection<{ _id: ObjectId; email: string }>("user");
  let failures = 0;
  for (const hours of [24, 1] as const) {
    const window = { $gt: new Date(+now + (hours === 24 ? hour : 0)), $lte: new Date(+now + hours * hour) };
    for (const role of ["mentor", "learner"] as const) {
      const marker = `emailReminders.${hours}h-${role}`;
      const due = { status: "accepted", start: window, [marker]: { $exists: false } } as const;
      for await (const candidate of bookings.find(due, { projection: { _id: 1 } })) {
        try {
          const booking = await bookings.findOne({ _id: candidate._id, ...due });
          if (!booking || booking.start <= new Date()) continue;
          const account = await users.findOne({ _id: new ObjectId(booking[role]) }, { projection: { email: 1 } });
          if (!account?.email) continue;
          const url = new URL(`/sessions#session-${booking._id}`, baseURL);
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `skillswap/${booking._id}/${hours}h/${role}`,
            },
            body: JSON.stringify({
              from,
              to: [account.email],
              subject: "Upcoming SkillSwap session",
              text: `Your ${booking.skill} session starts at ${booking.start.toISOString()} (UTC). Open My Sessions for your local time and meeting details.\n\n${url}`,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) throw new Error(`Email provider responded with HTTP ${response.status}.`);
          await bookings.updateOne({ _id: booking._id }, { $set: { [marker]: new Date() } });
        } catch {
          failures++;
        }
      }
    }
  }
  if (failures) throw new Error(`${failures} session reminders could not be processed and can be retried within their delivery windows.`);
}
