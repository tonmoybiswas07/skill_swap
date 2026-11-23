import { collections } from "@/lib/booking";
import { profiles } from "@/lib/profiles";
import { requireUser } from "@/lib/session";
import { submit } from "../actions";
import { ActionForm, LocalTime } from "../interactive";

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, slots] = await Promise.all([
    profiles().findOne({ _id: user.id }),
    collections().slots.find({ mentor: user.id, start: { $gt: new Date() } }).sort({ start: 1 }).toArray(),
  ]);

  return <main className="discover">
    <h1>Your profile</h1>
    <div className="panels">
      <section className="panel">
        <h2>Campus profile</h2>
        <ActionForm action={submit.bind(null, "profile")}>
          <label>Display name<input name="name" maxLength={80} defaultValue={profile?.name ?? user.name} required /></label>
          <label>Campus<input name="campus" maxLength={80} defaultValue={profile?.campus} required /></label>
          <label>Short bio<textarea name="bio" rows={3} maxLength={400} defaultValue={profile?.bio} /></label>
          <label>Skills you teach, comma-separated<input name="teaches" maxLength={800} defaultValue={profile?.teaches.join(", ")} /></label>
          <label>Skills you want to learn, comma-separated<input name="learns" maxLength={800} defaultValue={profile?.learns.join(", ")} /></label>
          <button className="primary">Save profile</button>
        </ActionForm>
      </section>
      <section className="panel">
        <h2>Mentor availability</h2>
        <p>Publish a 30-minute slot using your local time.</p>
        <ActionForm action={submit.bind(null, "publish")} localTime>
          <label>Start time<input name="start" type="datetime-local" required /></label>
          <button className="primary" disabled={!profile?.teaches.length}>Publish slot</button>
        </ActionForm>
        {!profile?.teaches.length && <p>Add a skill you teach to publish slots.</p>}
        {slots.length > 0 && <ul>{slots.map((slot) => <li key={String(slot._id)}>
          <LocalTime start={slot.start.toISOString()} end={slot.end.toISOString()} /> · {slot.booking ? "Booked" : "Open"}
        </li>)}</ul>}
      </section>
    </div>
  </main>;
}
