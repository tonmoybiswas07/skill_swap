import Link from "next/link";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { canReviewDispute, collections, isDisputeModerator, type Booking } from "@/lib/booking";
import { feedback } from "@/lib/feedback";
import { profiles } from "@/lib/profiles";
import { requireUser } from "@/lib/session";
import { submit } from "../actions";
import { ActionForm, LocalTime } from "../interactive";

const statusLabels = {
  pending: "Pending", accepted: "Accepted", rejected: "Rejected",
  cancelled: "Cancelled", completed: "Completed", expired: "Expired", disputed: "In dispute", refunded: "Refunded",
};

export default async function SessionsPage() {
  const user = await requireUser();
  const { bookings } = collections();
  const sessions = await bookings.find({ $or: [{ mentor: user.id }, { learner: user.id }] }).sort({ start: 1 }).toArray();
  const peers = [...new Set(sessions.map((booking) => booking.mentor === user.id ? booking.learner : booking.mentor))];
  const [members, accounts, reviews] = await Promise.all([
    profiles().find({ _id: { $in: peers } }).toArray(),
    getDatabase().db.collection<{ _id: ObjectId; name: string }>("user").find({
      _id: { $in: peers.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) },
    }, { projection: { name: 1 } }).toArray(),
    feedback().distinct("_id", { _id: { $in: sessions.filter((booking) => booking.learner === user.id && booking.status === "completed").map((booking) => booking._id) } }),
  ]);
  const reviewed = new Set(reviews.map(String));
  const names = new Map(accounts.map((account) => [String(account._id), account.name]));
  for (const member of members) names.set(member._id, member.name);
  const now = new Date();
  const requests = sessions.filter((booking) => booking.status === "pending" && booking.start > now);
  const upcoming = sessions.filter((booking) => booking.status === "accepted" && booking.end > now);
  const history = sessions.filter((booking) => !requests.includes(booking) && !upcoming.includes(booking)).reverse();
  const groups: [string, Booking[], string][] = [
    ["Requests", requests, "No pending requests."],
    ["Upcoming sessions", upcoming, "No upcoming sessions."],
    ["History", history, "No past sessions."],
  ];

  return <main className="discover">
    <h1>My Sessions</h1>
    {isDisputeModerator(user.id) && <Link className="button moderation-link" href="/moderation">Review disputes</Link>}
    <div className="panels">
      {groups.map(([label, items, empty]) => <section className="panel" key={label}>
        <h2>{label}</h2>
        {!items.length && <p>{empty}</p>}
        {items.map((booking) => {
          const mentor = booking.mentor === user.id;
          const peer = names.get(mentor ? booking.learner : booking.mentor) || "Campus member";
          const future = booking.start > now;
          const accepted = booking.status === "accepted";
          const pending = booking.status === "pending" && future;
          const confirmed = mentor ? booking.mentorConfirmed : booking.learnerConfirmed;
          const status = booking.status === "pending" && !future ? "expired" : booking.status;
          return <article className="session" id={`session-${booking._id}`} key={String(booking._id)}>
            <h3>{booking.skill} · {peer}</h3>
            <p>{mentor ? "Teaching" : "Learning"} · <span className="session-status" data-status={status}>{statusLabels[status]}</span></p>
            <LocalTime start={booking.start.toISOString()} end={booking.end.toISOString()} />
            {accepted && future && <a className="button calendar-link" href={`/api/sessions/${booking._id}/calendar`}>Add to calendar</a>}
            {accepted && booking.end <= now && confirmed && <p>Confirmed. Waiting for the other participant.</p>}
            {(pending || (accepted && (future || (booking.end <= now && !confirmed)))) && <ActionForm action={submit.bind(null, "change")}>
              <input type="hidden" name="booking" value={String(booking._id)} />
              <div className="session-actions">
                {mentor && pending && <>
                  <button className="primary" name="action" value="accept">Accept</button>
                  <button name="action" value="reject">Reject</button>
                </>}
                {future && <button name="action" value="cancel">Cancel</button>}
                {accepted && booking.end <= now && <button className="primary" name="action" value="confirm">Confirm completion</button>}
              </div>
            </ActionForm>}
            {accepted && booking.end <= now && (canReviewDispute(booking) ? <details>
              <summary>Report a no-show or issue</summary>
              <p>The credit stays reserved until a moderator decides the outcome.</p>
              <ActionForm action={submit.bind(null, "change")}>
                <input type="hidden" name="booking" value={String(booking._id)} />
                <input type="hidden" name="action" value="report" />
                <label>What happened?<textarea name="reason" rows={3} maxLength={500} required /></label>
                <button>Submit report</button>
              </ActionForm>
            </details> : <p>Dispute review is currently unavailable for this session.</p>)}
            {booking.status === "disputed" && <p>Credit reserved pending moderator review.</p>}
            {booking.status === "completed" && !mentor && (reviewed.has(String(booking._id))
              ? <p>Feedback submitted.</p> : <details>
                <summary>Leave feedback</summary>
                <ActionForm action={submit.bind(null, "feedback")}>
                  <input type="hidden" name="booking" value={String(booking._id)} />
                  <label>Rating<select name="rating" defaultValue="" required>
                    <option value="" disabled>Choose a rating</option>
                    {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
                  </select></label>
                  <label>Public comment (optional)<textarea name="comment" rows={3} maxLength={400} /></label>
                  <button>Publish feedback</button>
                </ActionForm>
              </details>)}
          </article>;
        })}
      </section>)}
    </div>
  </main>;
}
