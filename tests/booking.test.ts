import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { getAuth } from "../lib/auth.ts";
import { changeBooking, collections, ensureWallet, publishSlot, requestSlot } from "../lib/booking.ts";
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
  skip: !process.env.MONGODB_URI && "Set MONGODB_URI to a transaction-capable test server",
  timeout: 60_000,
}, async () => {
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

    async function slot(mentor: string, minutes: number) {
      const start = new Date(Date.now() + minutes * 60_000);
      await publishSlot(mentor, start.toISOString());
      const entry = await slots.findOne({ mentor, start });
      assert.ok(entry);
      assert.equal(+entry.end - +entry.start, 30 * 60_000);
      return String(entry._id);
    }

    await Promise.all([ensureWallet(rafi), ensureWallet(rafi)]);
    assert.equal(await ledger.countDocuments({ userId: rafi, kind: "grant" }), 1);
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
    assert.equal(await ledger.countDocuments({ kind: "reservation", booking: winning._id }), 1);

    const unpaid = await requestSlot(winning.learner, thirdSlot, "React");
    await assert.rejects(changeBooking(rafi, String(unpaid), "accept"), /insufficient/);
    assert.equal((await bookings.findOne({ _id: unpaid }))?.status, "pending");
    await assert.rejects(changeBooking(winning.learner, String(winning._id), "confirm"), /unavailable/);
    await changeBooking(winning.learner, String(winning._id), "cancel");
    await assert.rejects(changeBooking(winning.learner, String(winning._id), "cancel"), /unavailable/);
    await balance(winning.learner, 1, 0);
    assert.equal(await ledger.countDocuments({ kind: "release", booking: winning._id }), 1);
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
      assert.equal(await ledger.countDocuments({ kind: "transfer", booking: id }), 2);
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
  } finally {
    try { await db.dropDatabase(); } finally { await client.close(); }
  }
});
