import { MongoServerError, ObjectId, type ClientSession } from "mongodb";
import { getDatabase } from "./db.ts";
import { profiles } from "./profiles.ts";

type Status = "pending" | "accepted" | "rejected" | "cancelled" | "completed" | "expired";
export type Slot = { _id: ObjectId; mentor: string; start: Date; end: Date; revision?: number; booking?: ObjectId };
export type Booking = {
  _id: ObjectId; slot: ObjectId; mentor: string; learner: string; skill: string;
  start: Date; end: Date; status: Status; active: boolean;
  mentorConfirmed?: boolean; learnerConfirmed?: boolean;
};

type Wallet = { _id: string; available: number; reserved: number; revision?: number };
type Entry = {
  _id: string; userId: string; kind: "grant" | "reservation" | "release" | "transfer";
  available: number; reserved: number; at: Date; booking?: ObjectId;
};

export class BookingError extends Error {}

export function collections() {
  const { db } = getDatabase();
  return {
    slots: db.collection<Slot>("slots"),
    bookings: db.collection<Booking>("bookings"),
    wallets: db.collection<Wallet>("wallets"),
    ledger: db.collection<Entry>("ledger"),
  };
}

let indexes: Promise<unknown> | undefined;
function ensureIndexes() {
  const { slots, bookings, ledger } = collections();
  indexes ??= Promise.all([
    slots.createIndex({ mentor: 1, start: 1 }, { unique: true }),
    bookings.createIndex({ slot: 1, learner: 1 }, { unique: true, partialFilterExpression: { active: true } }),
    bookings.createIndex({ learner: 1, status: 1, start: 1 }),
    bookings.createIndex({ mentor: 1, status: 1, start: 1 }),
    ledger.createIndex({ userId: 1, at: -1 }),
  ]).catch((error: unknown) => { indexes = undefined; throw error; });
  return indexes;
}

async function transaction<T>(work: (session: ClientSession) => Promise<T>) {
  await ensureIndexes();
  return getDatabase().client.withSession((session) =>
    session.withTransaction(() => work(session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    })
  );
}

export async function ensureWallet(userId: string) {
  const { wallets, ledger } = collections();
  if (await wallets.findOne({ _id: userId })) return;
  try {
    await transaction(async (session) => {
      if (await wallets.findOne({ _id: userId }, { session })) return;
      await wallets.insertOne({ _id: userId, available: 1, reserved: 0 }, { session });
      await ledger.insertOne({ _id: `grant:${userId}`, userId, kind: "grant", available: 1, reserved: 0, at: new Date() }, { session });
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000 && await wallets.findOne({ _id: userId })) return;
    throw error;
  }
}

function objectId(value: string) {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new BookingError("Invalid session or slot.");
  return new ObjectId(value);
}

export async function publishSlot(mentor: string, timestamp: string) {
  if (!/Z$/.test(timestamp)) throw new BookingError("Select a future date and time.");
  const start = new Date(timestamp);
  if (!Number.isFinite(+start) || +start <= Date.now()) throw new BookingError("Select a future date and time.");
  const end = new Date(+start + 30 * 60_000);
  const { slots } = collections();
  await ensureWallet(mentor);
  await transaction(async (session) => {
    const { wallets } = collections();
    await wallets.updateOne({ _id: mentor }, { $inc: { revision: 1 } }, { session });
    const profile = await profiles().findOne({ _id: mentor }, { session });
    if (!profile?.teaches.length) throw new BookingError("Add a skill you teach before publishing slots.");
    if (await slots.findOne({ mentor, start: { $lt: end }, end: { $gt: start } }, { session })) {
      throw new BookingError("This time overlaps a slot you already published.");
    }
    await slots.insertOne({ _id: new ObjectId(), mentor, start, end }, { session });
  });
}

export async function requestSlot(learner: string, slotId: string, skill: string) {
  const id = objectId(slotId);
  const { slots, bookings } = collections();
  await ensureWallet(learner);
  try {
    return await transaction(async (session) => {
      const slot = await slots.findOne({ _id: id, start: { $gt: new Date() }, booking: { $exists: false } }, { session });
      if (!slot) throw new BookingError("This slot is no longer available.");
      if (slot.mentor === learner) throw new BookingError("You cannot book your own slot.");
      const mentor = await profiles().findOne({ _id: slot.mentor }, { session });
      if (!mentor?.teaches.includes(skill)) throw new BookingError("Choose a skill the mentor currently teaches.");
      // Serialize requests with acceptance on the slot document.
      await slots.updateOne({ _id: id }, { $inc: { revision: 1 } }, { session });
      const booking: Booking = {
        _id: new ObjectId(), slot: id, mentor: slot.mentor, learner, skill,
        start: slot.start, end: slot.end, status: "pending", active: true,
      };
      await bookings.insertOne(booking, { session });
      return booking._id;
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new BookingError("You already have an active request for this slot.");
    throw error;
  }
}

async function postEntry(session: ClientSession, booking: Booking, userId: string, kind: Entry["kind"], available: number, reserved: number) {
  const { ledger, wallets } = collections();
  const balance = await wallets.updateOne({
    _id: userId, available: { $gte: Math.max(0, -available) }, reserved: { $gte: Math.max(0, -reserved) },
  }, { $inc: { available, reserved } }, { session });
  if (!balance.matchedCount) throw new BookingError(kind === "reservation" ? "The learner has insufficient available credit. The request is still pending." : "The credit reservation could not be updated.");
  await ledger.insertOne({
    _id: `${booking._id}:${kind}:${userId}`, userId, kind, available, reserved, booking: booking._id, at: new Date(),
  }, { session });
}

export async function changeBooking(userId: string, bookingId: string, action: string) {
  const { bookings, slots, wallets } = collections();
  const id = objectId(bookingId);
  // An account created before the wallet feature can also accept a request.
  await ensureWallet(userId);
  await transaction(async (session) => {
    const booking = await bookings.findOne({ _id: id }, { session });
    if (!booking || (booking.mentor !== userId && booking.learner !== userId)) throw new BookingError("Session not found.");
    const isMentor = booking.mentor === userId;
    const now = new Date();
    const future = booking.start > now;
    const setStatus = (status: Status) => bookings.updateOne({ _id: id }, {
      $set: { status, active: status === "accepted" || status === "pending" },
    }, { session });

    if (action === "accept" && isMentor && booking.status === "pending" && future) {
      if (!(await profiles().findOne({ _id: booking.mentor, teaches: booking.skill }, { session }))) {
        throw new BookingError("Add this skill back to your profile before accepting.");
      }
      const participants = [booking.learner, booking.mentor].sort();
      for (const participant of participants) {
        await wallets.updateOne({ _id: participant }, { $inc: { revision: 1 } }, { session });
      }
      const overlap = await bookings.findOne({
        status: "accepted", start: { $lt: booking.end }, end: { $gt: booking.start },
        $or: [{ learner: { $in: participants } }, { mentor: { $in: participants } }],
      }, { session });
      if (overlap) throw new BookingError("One participant already has a session at this time.");
      const claim = await slots.updateOne({ _id: booking.slot, booking: { $exists: false } }, { $set: { booking: id } }, { session });
      if (!claim.matchedCount) throw new BookingError("This slot has already been booked.");
      await postEntry(session, booking, booking.learner, "reservation", -1, 1);
      await setStatus("accepted");
      await bookings.updateMany({ slot: booking.slot, _id: { $ne: id }, status: "pending" }, {
        $set: { status: "rejected", active: false },
      }, { session });
      return;
    }
    if (action === "reject" && isMentor && booking.status === "pending" && future) {
      await setStatus("rejected");
      return;
    }
    if (action === "cancel" && future && (booking.status === "pending" || booking.status === "accepted")) {
      if (booking.status === "accepted") {
        const release = await slots.updateOne({ _id: booking.slot, booking: id }, { $unset: { booking: "" } }, { session });
        if (!release.matchedCount) throw new BookingError("The slot reservation could not be released.");
        await postEntry(session, booking, booking.learner, "release", 1, -1);
      }
      await setStatus("cancelled");
      return;
    }
    if (action === "confirm") {
      if (booking.status === "completed") return;
      if (booking.status === "accepted" && booking.end <= now) {
        const field = isMentor ? "mentorConfirmed" : "learnerConfirmed";
        if (booking[field]) return;
        await bookings.updateOne({ _id: id }, { $set: { [field]: true } }, { session });
        if (isMentor ? booking.learnerConfirmed : booking.mentorConfirmed) {
          await postEntry(session, booking, booking.learner, "transfer", 0, -1);
          await postEntry(session, booking, booking.mentor, "transfer", 1, 0);
          await setStatus("completed");
        }
        return;
      }
    }
    throw new BookingError("This action is unavailable for this session.");
  });
}
