import Link from "next/link";
import { notFound } from "next/navigation";
import { collections } from "@/lib/booking";
import { profiles } from "@/lib/profiles";
import { currentUser } from "@/lib/session";
import { submit } from "../../actions";
import { ActionForm, LocalTime } from "../../interactive";

export default async function MentorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!process.env.MONGODB_URI) notFound();
  const [user, mentor] = await Promise.all([currentUser(), profiles().findOne({ _id: id })]);
  if (!mentor) notFound();
  const { slots, bookings } = collections();
  const [open, pending] = await Promise.all([
    slots.find({ mentor: id, start: { $gt: new Date() }, booking: { $exists: false } }).sort({ start: 1 }).toArray(),
    user ? bookings.distinct("slot", { mentor: id, learner: user.id, status: "pending", start: { $gt: new Date() } }) : [],
  ]);
  const requested = new Set(pending.map(String));

  return <main className="discover">
    <Link href="/">Back to Discover</Link>
    <h1>{mentor.name}</h1>
    <div className="panels">
      <section className="panel">
        <h2>{mentor.campus}</h2>
        {mentor.bio && <p>{mentor.bio}</p>}
        {!!mentor.teaches.length && <p className="teach">Teaches {mentor.teaches.join(", ")}</p>}
        {!!mentor.learns.length && <p className="learn">Learning {mentor.learns.join(", ")}</p>}
      </section>
      <section className="panel">
        <h2>Available sessions</h2>
        <p>30 minutes · 1 credit per session</p>
        {user?.id === id && <p><Link href="/profile">Manage your profile and availability</Link></p>}
        {!open.length || !mentor.teaches.length ? <p>No open sessions.</p> : <ul className="slots">
          {open.map((slot) => <li key={String(slot._id)}>
            <LocalTime start={slot.start.toISOString()} end={slot.end.toISOString()} />
            {requested.has(String(slot._id)) ? <p>Request pending</p> : user && user.id !== id && <ActionForm action={submit.bind(null, "request")}>
              <input type="hidden" name="slot" value={String(slot._id)} />
              <label>Skill<select name="skill">{mentor.teaches.map((skill) => <option key={skill}>{skill}</option>)}</select></label>
              <button className="primary">Request session</button>
            </ActionForm>}
          </li>)}
        </ul>}
        {!user && !!open.length && <Link href="/account">Sign in to request a session</Link>}
      </section>
    </div>
  </main>;
}
