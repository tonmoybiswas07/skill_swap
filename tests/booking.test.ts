import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { getAuth } from "../lib/auth.ts";
import { changeBooking, collections, ensureWallet, maintainBookings, publishSlot, publishSlots, removeSlot, requestSlot } from "../lib/booking.ts";
import { sendCampusCode, verifiedInstitutions, verifyCampusCode } from "../lib/campus.ts";
import { feedback, leaveFeedback } from "../lib/feedback.ts";
import { markNotificationsRead, notifications } from "../lib/notifications.ts";
import { sendSessionReminders } from "../lib/reminders.ts";
import { getDatabase } from "../lib/db.ts";
import { mutualMatch, profiles, saveProfile, type Profile } from "../lib/profiles.ts";

test("a mutual match requires a skill in each direction", () => {
  const base = { name: "Member", campus: "DU", bio: "" };
  const viewer: Profile = { ...base, _id: "viewer", teaches: ["React"], learns: ["Figma"] };
  const mentor: Profile = { ...base, _id: "mentor", teaches: ["figma"], learns: ["REACT"] };
  assert.deepEqual(mutualMatch(viewer, mentor), { offered: "React", wanted: "figma" });
  assert.equal(mutualMatch(viewer, { ...mentor, learns: ["Python"] }), null);
});

test("transactions protect slots and credits across the three-account exchange", {
  skip: !process.env.TEST_MONGODB_URI && "Set TEST_MONGODB_URI to a transaction-capable test server",
  timeout: 60_000,
}, async (context) => {
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
  process.env.MONGODB_DATABASE = `skillswap_test_${randomUUID().replaceAll("-", "")}`;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID();
  const { client, db } = getDatabase();

  try {
    async function account(name: string, teaches: string, learns: string) {
      const body = { email: `${name.toLowerCase()}@example.test`, name, password: randomUUID() };
      const auth = getAuth();
      const { user } = await auth.api.signUpEmail({ body });
      const signedIn = await auth.api.signInEmail({ body });
      assert.equal(signedIn.user.id, user.id);
      const form = new FormData();
      for (const [key, value] of Object.entries({ name, campus: "DU", bio: "", teaches, learns })) form.set(key, value);
      await saveProfile(user.id, form);
      return user.id;
    }

    const rafi = await account("Rafi", " React , ＲＥＡＣＴ ", "Figma");
    const anika = await account("Anika", "Python", "React");
    const nila = await account("Nila", "Figma", "React");
    const { slots, bookings, wallets, ledger } = collections();
    assert.deepEqual((await profiles().findOne({ _id: rafi }))?.teaches, ["React"]);

    async function balance(userId: string, available: number, reserved: number) {
      const wallet = await wallets.findOne({ _id: userId });
      assert.deepEqual([wallet?.available, wallet?.reserved], [available, reserved]);
    }

    async function activity(userId: string, kind: string, available: number, reserved: number, booking?: Awaited<ReturnType<typeof requestSlot>>) {
      const entries = await ledger.find(booking ? { userId, booking } : { userId }).toArray();
      assert.deepEqual(
        entries.filter((entry) => entry.kind === kind).map((entry) => [entry.available, entry.reserved]),
        [[available, reserved]],
      );
    }

    async function slot(mentor: string, minutes: number) {
      const start = new Date(Date.now() + minutes * 60_000);
      await publishSlot(mentor, start.toISOString());
      const entry = await slots.findOne({ mentor, start });
      assert.ok(entry);
      assert.equal(+entry.end - +entry.start, 30 * 60_000);
      return String(entry._id);
    }

    await Promise.all([ensureWallet(rafi), ensureWallet(rafi)]);
    await activity(rafi, "grant", 1, 0);
    await balance(rafi, 1, 0);

    const reactSlot = await slot(rafi, 60);
    const thirdSlot = await slot(rafi, 100);
    await assert.rejects(requestSlot(rafi, reactSlot, "React"), /own slot/);
    const react = await requestSlot(anika, reactSlot, "React");
    await assert.rejects(requestSlot(anika, reactSlot, "React"), /active request/);
    await assert.rejects(changeBooking(nila, String(react), "cancel"), /not found/);
    await assert.rejects(changeBooking(anika, String(react), "accept"), /unavailable/);
    const otherRequest = await requestSlot(nila, reactSlot, "React");
    const competing = await Promise.allSettled([
      changeBooking(rafi, String(react), "accept"),
      changeBooking(rafi, String(otherRequest), "accept"),
    ]);
    assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
    const winning = await bookings.findOne({ _id: { $in: [react, otherRequest] }, status: "accepted" });
    assert.ok(winning);
    await activity(winning.learner, "reservation", -1, 1, winning._id);

    const unpaid = await requestSlot(winning.learner, thirdSlot, "React");
    await assert.rejects(changeBooking(rafi, String(unpaid), "accept"), /insufficient/);
    assert.equal((await bookings.findOne({ _id: unpaid }))?.status, "pending");
    assert.equal(await ledger.countDocuments({ booking: unpaid }), 0);
    await assert.rejects(changeBooking(winning.learner, String(winning._id), "confirm"), /unavailable/);
    await changeBooking(winning.learner, String(winning._id), "cancel");
    await assert.rejects(changeBooking(winning.learner, String(winning._id), "cancel"), /unavailable/);
    await balance(winning.learner, 1, 0);
    await activity(winning.learner, "release", 1, -1, winning._id);
    await changeBooking(rafi, String(unpaid), "reject");
    assert.equal((await bookings.findOne({ _id: unpaid }))?.status, "rejected");

    async function complete(mentor: string, learner: string, id: Awaited<ReturnType<typeof requestSlot>>, beforeSecond: () => Promise<void>) {
      // Move the accepted fixture into the past instead of waiting for the slot to end.
      await bookings.updateOne({ _id: id }, { $set: { start: new Date(Date.now() - 31 * 60_000), end: new Date(Date.now() - 60_000) } });
      await assert.rejects(changeBooking(learner, String(id), "cancel"), /unavailable/);
      await changeBooking(learner, String(id), "confirm");
      await beforeSecond();
      await Promise.all([
        changeBooking(mentor, String(id), "confirm"),
        changeBooking(mentor, String(id), "confirm"),
      ]);
      await changeBooking(learner, String(id), "confirm");
      assert.equal((await bookings.findOne({ _id: id }))?.status, "completed");
      await activity(mentor, "transfer", 1, 0, id);
      await activity(learner, "transfer", 0, -1, id);
    }

    // Spend Rafi's starter credit on Python first, so Figma requires the React earnings.
    const python = await requestSlot(rafi, await slot(anika, 150), "Python");
    await changeBooking(anika, String(python), "accept");
    await complete(anika, rafi, python, () => balance(rafi, 0, 1));
    await balance(rafi, 0, 0);
    const figma = await requestSlot(rafi, await slot(nila, 200), "Figma");
    await assert.rejects(changeBooking(nila, String(figma), "accept"), /insufficient/);

    const teaching = await requestSlot(anika, reactSlot, "React");
    await changeBooking(rafi, String(teaching), "accept");
    await complete(rafi, anika, teaching, () => balance(rafi, 0, 0));
    await balance(rafi, 1, 0);

    await changeBooking(nila, String(figma), "accept");
    await balance(rafi, 0, 1);
    await activity(rafi, "reservation", -1, 1, figma);
    await complete(nila, rafi, figma, () => balance(nila, 1, 0));
    await balance(rafi, 0, 0);
    await balance(nila, 2, 0);

    const overlappingReact = await requestSlot(nila, await slot(rafi, 260), "React");
    const overlappingPython = await requestSlot(nila, await slot(anika, 260), "Python");
    const overlapping = await Promise.allSettled([
      changeBooking(rafi, String(overlappingReact), "accept"),
      changeBooking(anika, String(overlappingPython), "accept"),
    ]);
    assert.equal(overlapping.filter((result) => result.status === "fulfilled").length, 1);
    const [accepted, pending] = await Promise.all([
      bookings.findOne({ _id: { $in: [overlappingReact, overlappingPython] }, status: "accepted" }),
      bookings.findOne({ _id: { $in: [overlappingReact, overlappingPython] }, status: "pending" }),
    ]);
    assert.ok(accepted);
    assert.ok(pending);
    await balance(nila, 1, 1);
    await changeBooking(accepted.mentor, String(accepted._id), "cancel");
    await balance(nila, 2, 0);

    const weekly = [500, 500 + 7 * 24 * 60].map((minutes) => new Date(Date.now() + minutes * 60_000));
    await publishSlots(rafi, weekly.map((date) => date.toISOString()));
    const fresh = new Date(+weekly[1] + 60 * 60_000);
    await assert.rejects(publishSlots(rafi, [weekly[0].toISOString(), fresh.toISOString()]), /overlaps/);
    assert.equal(await slots.countDocuments({ mentor: rafi, start: fresh }), 0);
    const removable = await slots.findOne({ mentor: rafi, start: weekly[0] });
    assert.ok(removable);
    const removedRequest = await requestSlot(anika, String(removable._id), "React");
    await assert.rejects(removeSlot(anika, String(removable._id)), /unbooked/);
    await removeSlot(rafi, String(removable._id));
    assert.equal((await bookings.findOne({ _id: removedRequest }))?.status, "cancelled");
    assert.equal(await notifications().countDocuments({ recipient: anika, booking: removedRequest, kind: "cancelled" }), 1);
    assert.equal(await notifications().countDocuments({ recipient: rafi, booking: removedRequest, kind: "request" }), 1);
    await markNotificationsRead(anika);
    assert.equal(await notifications().countDocuments({ recipient: anika, readAt: { $exists: false } }), 0);

    process.env.DISPUTE_MODERATOR_IDS = nila;
    const disputedSlot = await slot(rafi, 310);
    const disputed = await requestSlot(anika, disputedSlot, "React");
    await changeBooking(rafi, String(disputed), "accept");
    await assert.rejects(removeSlot(rafi, disputedSlot), /unbooked/);
    await assert.rejects(changeBooking(anika, String(disputed), "report", "No-show"), /unavailable/);
    await bookings.updateOne({ _id: disputed }, { $set: { start: new Date(Date.now() - 31 * 60_000), end: new Date(Date.now() - 60_000) } });
    await changeBooking(anika, String(disputed), "report", "No-show");
    assert.equal((await bookings.findOne({ _id: disputed }))?.status, "disputed");
    await balance(anika, 0, 1);
    await assert.rejects(changeBooking(rafi, String(disputed), "confirm"), /unavailable/);
    await assert.rejects(changeBooking(rafi, String(disputed), "refund-dispute"), /moderator/);
    const refunds = await Promise.allSettled([
      changeBooking(nila, String(disputed), "refund-dispute"),
      changeBooking(nila, String(disputed), "refund-dispute"),
    ]);
    assert.equal(refunds.filter((result) => result.status === "fulfilled").length, 1);
    await balance(anika, 1, 0);
    await activity(anika, "release", 1, -1, disputed);
    assert.equal((await bookings.findOne({ _id: disputed }))?.dispute?.resolvedBy, nila);
    assert.equal(await notifications().countDocuments({ booking: disputed, kind: "refunded" }), 2);

    const contested = await requestSlot(anika, await slot(rafi, 350), "React");
    await changeBooking(rafi, String(contested), "accept");
    await bookings.updateOne({ _id: contested }, { $set: { start: new Date(Date.now() - 31 * 60_000), end: new Date(Date.now() - 60_000) } });
    await changeBooking(rafi, String(contested), "report", "Learner confirmed attendance during the call.");
    await changeBooking(nila, String(contested), "pay-dispute");
    assert.equal((await bookings.findOne({ _id: contested }))?.status, "completed");
    await balance(anika, 0, 0);
    await balance(rafi, 1, 0);
    await activity(rafi, "transfer", 1, 0, contested);

    await assert.rejects(leaveFeedback(anika, String(disputed), 5, ""), /completed/);
    await assert.rejects(leaveFeedback(rafi, String(teaching), 5, ""), /learner/);
    await leaveFeedback(anika, String(teaching), 5, "Helpful examples.");
    await assert.rejects(leaveFeedback(anika, String(teaching), 4, ""), /already reviewed/);
    assert.equal((await feedback().findOne({ _id: teaching }))?.comment, "Helpful examples.");

    const expired = await requestSlot(anika, await slot(rafi, 420), "React");
    const noShow = await requestSlot(nila, await slot(rafi, 460), "React");
    await assert.rejects(changeBooking(rafi, String(noShow), "accept", "", "http://example.test"), /HTTPS/);
    await changeBooking(rafi, String(noShow), "accept", "", "https://example.test/meeting");
    assert.deepEqual((await bookings.findOne({ _id: noShow }))?.meeting, {
      kind: "online", value: "https://example.test/meeting",
    });
    await bookings.updateOne({ _id: expired }, { $set: { start: new Date(Date.now() - 60_000) } });
    await bookings.updateOne({ _id: noShow }, { $set: { end: new Date(Date.now() - 60_000) } });
    await changeBooking(rafi, String(noShow), "confirm");
    await maintainBookings();
    assert.equal((await bookings.findOne({ _id: expired }))?.status, "expired");
    assert.equal(await notifications().countDocuments({ booking: noShow, kind: "confirm-session", recipient: nila }), 1);
    assert.equal(await notifications().countDocuments({ booking: noShow, kind: "confirm-session", recipient: rafi }), 0);
    await bookings.updateOne({ _id: noShow }, { $set: { end: new Date(Date.now() - 73 * 60 * 60_000) } });
    await assert.rejects(changeBooking(nila, String(noShow), "confirm"), /deadline/);
    await Promise.all([maintainBookings(), maintainBookings()]);
    assert.equal((await bookings.findOne({ _id: noShow }))?.status, "refunded");
    await activity(nila, "release", 1, -1, noShow);
    await balance(nila, 2, 0);

    const upcoming = await requestSlot(nila, await slot(rafi, 20), "React");
    await changeBooking(rafi, String(upcoming), "accept", "", "", "Library, room 2");
    process.env.RESEND_API_KEY = "mock-key";
    process.env.SESSION_REMINDER_FROM = "sender@example.test";
    const cancelledReminder = await requestSlot(rafi, await slot(nila, 55), "Figma");
    await changeBooking(nila, String(cancelledReminder), "accept");
    await changeBooking(rafi, String(cancelledReminder), "cancel");
    const deliveries = new Set<string>();
    let rejectFirstDelivery = true;
    const reminderFetch = context.mock.method(globalThis, "fetch", async (_: string, options: RequestInit) => {
      const key = new Headers(options.headers).get("Idempotency-Key");
      assert.ok(key);
      assert.match(key, new RegExp(`^skillswap/${upcoming}/(24|1)h/(learner|mentor)$`));
      if (rejectFirstDelivery) {
        rejectFirstDelivery = false;
        return new Response(null, { status: 503 });
      }
      deliveries.add(key);
      return new Response(null, { status: 200 });
    });
    const dayReminderTime = new Date(Date.now() - 2 * 60 * 60_000);
    await assert.rejects(sendSessionReminders(dayReminderTime), /1 session reminders/);
    await sendSessionReminders(dayReminderTime);
    await sendSessionReminders();
    await sendSessionReminders();
    assert.equal(deliveries.size, 4);
    assert.equal(reminderFetch.mock.callCount(), 5);
    await changeBooking(nila, String(upcoming), "cancel");
    await sendSessionReminders();
    assert.equal(reminderFetch.mock.callCount(), 5);
    reminderFetch.mock.restore();

    process.env.CAMPUS_EMAIL_DOMAINS = "example.test=Example University";
    process.env.RESEND_API_KEY = "mock-key";
    process.env.CAMPUS_EMAIL_FROM = "sender@example.test";
    let code = "";
    context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
      assert.equal(url, "https://api.resend.com/emails");
      const payload = JSON.parse(String(options.body));
      assert.deepEqual(payload.to, ["rafi@example.test"]);
      code = String(payload.text).match(/\d{8}/)?.[0] ?? "";
      return new Response(null, { status: 200 });
    });
    await assert.rejects(sendCampusCode(rafi, "rafi@sub.example.test"), /supported/);
    await sendCampusCode(rafi, "rafi@example.test");
    assert.match(code, /^\d{8}$/);
    await assert.rejects(sendCampusCode(rafi, "rafi@example.test"), /last minute/);
    await assert.rejects(verifyCampusCode(anika, "anika@example.test", code), /expired/);
    const wrongCode = code === "00000000" ? "00000001" : "00000000";
    await assert.rejects(verifyCampusCode(rafi, "rafi@example.test", wrongCode), /did not match/);
    await verifyCampusCode(rafi, "rafi@example.test", code);
    await assert.rejects(verifyCampusCode(rafi, "rafi@example.test", code), /expired/);
    assert.deepEqual([...(await verifiedInstitutions([rafi, anika]))], [[rafi, "Example University"]]);
  } finally {
    try { await db.dropDatabase(); } finally { await client.close(); }
  }
});
