import { ObjectId } from "mongodb";
import { collections } from "@/lib/booking";
import { sessionCalendar } from "@/lib/calendar";
import { currentUser } from "@/lib/session";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await currentUser();
  if (!user) return new Response("Sign in to download this session.", { status: 401, headers });

  const { id } = await params;
  const now = new Date();
  const booking = ObjectId.isValid(id) && await collections().bookings.findOne({
    _id: new ObjectId(id),
    $or: [{ mentor: user.id }, { learner: user.id }],
    status: "accepted",
    start: { $gt: now },
  });
  if (!booking) return new Response("Upcoming session not found.", { status: 404, headers });

  return new Response(sessionCalendar({
    id: booking._id.toHexString(), skill: booking.skill, start: booking.start, end: booking.end,
  }, now), {
    headers: {
      ...headers,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="skillswap-session.ics"',
    },
  });
}
