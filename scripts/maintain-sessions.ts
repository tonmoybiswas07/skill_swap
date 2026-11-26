import { maintainBookings } from "../lib/booking.ts";
import { getDatabase } from "../lib/db.ts";
import { sendSessionReminders } from "../lib/reminders.ts";

const { client } = getDatabase();
try {
  await maintainBookings();
  await sendSessionReminders();
} finally {
  await client.close();
}
