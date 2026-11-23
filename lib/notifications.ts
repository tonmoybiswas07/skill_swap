import type { ClientSession, ObjectId } from "mongodb";
import { getDatabase } from "./db.ts";

export type NotificationKind =
  | "request" | "accepted" | "rejected" | "cancelled" | "disputed"
  | "completed" | "refunded";

type Notification = {
  _id: string;
  recipient: string;
  booking: ObjectId;
  skill: string;
  kind: NotificationKind;
  createdAt: Date;
  readAt?: Date;
};

export function notifications() {
  return getDatabase().db.collection<Notification>("notifications");
}

export async function notify(session: ClientSession, booking: { _id: ObjectId; skill: string }, recipient: string, kind: NotificationKind) {
  const id = `${booking._id}:${recipient}:${kind}`;
  await notifications().updateOne({ _id: id }, { $setOnInsert: {
    recipient, booking: booking._id, skill: booking.skill, kind, createdAt: new Date(),
  } }, { upsert: true, session });
}

export async function markNotificationsRead(userId: string) {
  await notifications().updateMany({ recipient: userId, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
}
