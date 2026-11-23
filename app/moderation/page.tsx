import { notFound } from "next/navigation";
import { collections, isDisputeModerator } from "@/lib/booking";
import { requireUser } from "@/lib/session";
import { submit } from "../actions";
import { ActionForm, LocalTime } from "../interactive";

export default async function ModerationPage() {
  const user = await requireUser();
  if (!isDisputeModerator(user.id)) notFound();
  const open = await collections().bookings.find({
    status: "disputed", learner: { $ne: user.id }, mentor: { $ne: user.id },
  }).sort({ "dispute.openedAt": 1 }).toArray();

  return <main className="discover">
    <h1>Session disputes</h1>
    <section className="panel">
      <h2>Open reports</h2>
      {!open.length && <p>No open reports.</p>}
      {open.map((booking) => <article className="session" key={String(booking._id)}>
        <h3>{booking.skill}</h3>
        <LocalTime start={booking.start.toISOString()} end={booking.end.toISOString()} />
        <p>Reported by the {booking.dispute?.by === booking.mentor ? "mentor" : "learner"}.</p>
        <p>{booking.dispute?.reason}</p>
        <p>Session reference {String(booking._id)}</p>
        <ActionForm action={submit.bind(null, "change")}>
          <input type="hidden" name="booking" value={String(booking._id)} />
          <div className="session-actions">
            <button name="action" value="refund-dispute">Refund learner</button>
            <button name="action" value="pay-dispute">Pay mentor</button>
          </div>
        </ActionForm>
      </article>)}
    </section>
  </main>;
}
