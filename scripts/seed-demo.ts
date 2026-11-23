import { getAuth } from "../lib/auth.ts";
import { collections, ensureWallet, publishSlot } from "../lib/booking.ts";
import { getDatabase } from "../lib/db.ts";
import { saveProfile } from "../lib/profiles.ts";

const password = process.env.DEMO_PASSWORD;
if (process.env.MONGODB_DATABASE !== "skillswap_demo" || !password || password.length < 8) {
  throw new Error("Use the skillswap_demo database and set a local DEMO_PASSWORD of at least 8 characters.");
}

const { client } = getDatabase();
try {
  const members = [
    { email: "rafi@example.test", name: "Rafi Hasan", campus: "DU", teaches: "React", learns: "Figma", bio: "I can help you build your first React component." },
    { email: "anika@example.test", name: "Anika Rahman", campus: "IUT", teaches: "Python", learns: "React", bio: "I use Python for campus projects." },
    { email: "nila@example.test", name: "Nila Ahmed", campus: "BUET", teaches: "Figma", learns: "React", bio: "Let's make an interactive Figma prototype." },
  ];
  for (const [index, member] of members.entries()) {
    const auth = getAuth();
    const exists = await getDatabase().db.collection("user").findOne({ email: member.email });
    const { user } = exists
      ? await auth.api.signInEmail({ body: { email: member.email, password } })
      : await auth.api.signUpEmail({ body: { email: member.email, password, name: member.name } });
    await ensureWallet(user.id);
    const form = new FormData();
    for (const [field, value] of Object.entries(member)) form.set(field, value);
    await saveProfile(user.id, form);
    const future = await collections().slots.findOne({ mentor: user.id, start: { $gt: new Date() }, booking: { $exists: false } });
    if (!future) {
      const latest = await collections().slots.findOne({ mentor: user.id, end: { $gt: new Date() } }, { sort: { end: -1 } });
      const earliest = Math.max(Date.now() + (5 + 45 * index) * 60_000, latest?.end.getTime() ?? 0);
      const start = new Date(Math.ceil(earliest / 60_000) * 60_000);
      await publishSlot(user.id, start.toISOString());
    }
    console.log(member.email);
  }
} finally {
  await client.close();
}
