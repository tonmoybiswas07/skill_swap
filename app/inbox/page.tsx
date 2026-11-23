import Link from "next/link";
import { collections } from "@/lib/booking";
import { notifications, type NotificationKind } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { submit } from "../actions";
import { ActionForm, LocalTime } from "../interactive";

const labels: Record<NotificationKind, string> = {
  request: "New booking request", accepted: "Request accepted", rejected: "Request declined",
  cancelled: "Session cancelled", disputed: "Session issue reported",
  completed: "Session completed", refunded: "Credit returned to learner",
};

export default async function InboxPage() {
  const user = await requireUser();
  const now = new Date();
  const [activity, reminders] = await Promise.all([
    notifications().find({ recipient: user.id }).sort({ createdAt: -1, _id: -1 }).limit(80).toArray(),
    collections().bookings.find({
      $or: [{ mentor: user.id }, { learner: user.id }],
      status: "accepted", start: { $gt: now, $lte: new Date(+now + 24 * 60 * 60_000) },
    }).sort({ start: 1 }).toArray(),
  ]);

  return <main className="discover">
    <h1>Inbox</h1>
    <div className="panels">
      <section className="panel">
        <h2>Next 24 hours</h2>
        {!reminders.length ? <p>No sessions starting in the next 24 hours.</p> : <ul className="slots">
          {reminders.map((booking) => <li key={String(booking._id)}>
            <strong>{booking.skill}</strong>
            <p><LocalTime start={booking.start.toISOString()} end={booking.end.toISOString()} /></p>
            <Link href={`/sessions#session-${booking._id}`}>View session</Link>
          </li>)}
        </ul>}
      </section>
      <section className="panel">
        <h2>Booking updates</h2>
        {activity.some((item) => !item.readAt) && <ActionForm action={submit.bind(null, "read-inbox")}>
          <button>Mark all as read</button>
        </ActionForm>}
        {!activity.length ? <p>No booking updates yet.</p> : <ul className="slots">
          {activity.map((item) => <li key={item._id}>
            <strong>{labels[item.kind]} · {item.skill}</strong>
            {!item.readAt && <span className="session-status inbox-new">Unread</span>}
            <p><LocalTime start={item.createdAt.toISOString()} /></p>
            <Link href={`/sessions#session-${item.booking}`}>View session</Link>
          </li>)}
        </ul>}
      </section>
    </div>
  </main>;
}
