import { MongoServerError, ObjectId } from "mongodb";
import { BookingError, collections } from "./booking.ts";
import { getDatabase } from "./db.ts";

type Feedback = {
  _id: ObjectId;
  mentor: string;
  skill: string;
  rating: number;
  comment: string;
  createdAt: Date;
};

export function feedback() {
  return getDatabase().db.collection<Feedback>("feedback");
}

export async function leaveFeedback(userId: string, bookingId: string, rating: number, comment: string) {
  if (!ObjectId.isValid(bookingId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.trim().length > 400) {
    throw new BookingError("Choose a rating from 1 to 5 and use at most 400 characters.");
  }
  const id = new ObjectId(bookingId);
  const booking = await collections().bookings.findOne({
    _id: id, learner: userId, status: "completed",
  });
  if (!booking) throw new BookingError("Only the learner in a completed session can leave feedback.");
  try {
    await feedback().insertOne({
      _id: id, mentor: booking.mentor, skill: booking.skill, rating, comment: comment.trim(), createdAt: new Date(),
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new BookingError("You already reviewed this session.");
    throw error;
  }
}
