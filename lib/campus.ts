import { createHmac, randomInt, randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import { getDatabase } from "./db.ts";

export class CampusError extends Error {}

type CampusVerification = {
  _id: string;
  email: string;
  sentAt: Date;
  expiresAt: Date;
  attempts: number;
  nonce?: string;
  digest?: string;
  verifiedAt?: Date;
};

function verifications() {
  return getDatabase().db.collection<CampusVerification>("campusVerifications");
}

export function institutionFor(email: string) {
  const domain = email.split("@").at(-1)?.toLowerCase();
  if (!email.includes("@")) return undefined;
  for (const entry of (process.env.CAMPUS_EMAIL_DOMAINS ?? "").split(",")) {
    const [allowed, institution] = entry.split("=");
    if (allowed?.trim().toLowerCase() === domain && institution?.trim()) return institution.trim();
  }
}

export async function verifiedInstitutions(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const verified = await verifications().find({ _id: { $in: userIds }, verifiedAt: { $exists: true } }).toArray();
  return new Map(verified.flatMap((entry) => {
    const institution = institutionFor(entry.email);
    return institution ? [[entry._id, institution] as const] : [];
  }));
}

function codeDigest(userId: string, nonce: string, code: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Verification secret missing.");
  return createHmac("sha256", secret).update(`campus:${userId}:${nonce}:${code}`).digest("hex");
}

export async function sendCampusCode(userId: string, email: string) {
  const institution = institutionFor(email);
  if (!institution) throw new CampusError("Your account email does not match a supported institution.");
  if (!process.env.RESEND_API_KEY || !process.env.CAMPUS_EMAIL_FROM) {
    throw new CampusError("Campus email delivery is unavailable.");
  }

  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const nonce = randomUUID();
  const now = new Date();
  const digest = codeDigest(userId, nonce, code);
  try {
    await verifications().updateOne({
      _id: userId, verifiedAt: { $exists: false },
      $or: [{ sentAt: { $exists: false } }, { sentAt: { $lte: new Date(+now - 60_000) } }],
    }, { $set: { email, sentAt: now, expiresAt: new Date(+now + 10 * 60_000), attempts: 0, nonce, digest } }, { upsert: true });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new CampusError("This account is already verified or a code was requested in the last minute.");
    }
    throw error;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.CAMPUS_EMAIL_FROM, to: [email], subject: "Your SkillSwap campus verification code",
        text: `Your code is ${code}. It expires in 10 minutes.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return;
  } catch {
    // Delivery failures release this challenge below.
  }
  await verifications().deleteOne({ _id: userId, nonce, verifiedAt: { $exists: false } });
  throw new CampusError("We could not send the code. Try again in a moment.");
}

export async function verifyCampusCode(userId: string, email: string, code: string) {
  if (!institutionFor(email) || !/^\d{8}$/.test(code)) throw new CampusError("Enter the eight-digit verification code.");
  const now = new Date();
  const challenge = await verifications().findOneAndUpdate({
    _id: userId, email, expiresAt: { $gt: now }, verifiedAt: { $exists: false }, attempts: { $lt: 5 },
  }, { $inc: { attempts: 1 } });
  if (!challenge?.nonce) throw new CampusError("This code expired or has reached its attempt limit. Request a new one.");
  const result = await verifications().updateOne({
    _id: userId, email, nonce: challenge.nonce, digest: codeDigest(userId, challenge.nonce, code),
    expiresAt: { $gt: new Date() }, verifiedAt: { $exists: false },
  }, { $set: { verifiedAt: new Date() }, $unset: { nonce: "", digest: "" } });
  if (!result.matchedCount) throw new CampusError("That code did not match. Check your email and try again.");
}
