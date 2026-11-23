import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { collections, type Booking } from "@/lib/booking";
import { profiles } from "@/lib/profiles";
import { requireUser } from "@/lib/session";
import { submit } from "../actions";
import { ActionForm, LocalTime } from "../interactive";

const statusLabels = {
  pending: "Pending", accepted: "Accepted", rejected: "Rejected",
  cancelled: "Cancelled", completed: "Completed", expired: "Expired",
};

export default async function SessionsPage() {
  const user = await requireUser();
  const { bookings } = collections();
  const sessions = await bookings.find({ $or: [{ mentor: user.id }, { learner: user.id }] }).sort({ start: 1 }).toArray();
  const peers = [...new Set(sessions.map((booking) => booking.mentor === user.id ? booking.learner : booking.mentor))];
  const [members, accounts] = await Promise.all([
    profiles().find({ _id: { $in: peers } }).toArray(),
    getDatabase().db.collection<{ _id: ObjectId; name: string }>("user").find({
      _id: { $in: peers.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)) },
    }, { projection: { name: 1 } }).toArray(),
  ]);
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
          return <article className="session" key={String(booking._id)}>
            <h3>{booking.skill} · {peer}</h3>
            <p>{mentor ? "Teaching" : "Learning"} · <span className="session-status" data-status={status}>{statusLabels[status]}</span></p>
            <LocalTime start={booking.start.toISOString()} end={booking.end.toISOString()} />
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
          </article>;
        })}
      </section>)}
    </div>
  </main>;
}
