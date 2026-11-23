import { institutionFor, verifiedInstitutions } from "@/lib/campus";
import { collections } from "@/lib/booking";
import { profiles } from "@/lib/profiles";
import { requireUser } from "@/lib/session";
import { submit } from "../actions";
import { ActionForm, LocalTime } from "../interactive";

export default async function ProfilePage() {
  const user = await requireUser();
  const [verified, profile, slots] = await Promise.all([
    verifiedInstitutions([user.id]),
    profiles().findOne({ _id: user.id }),
    collections().slots.find({ mentor: user.id, start: { $gt: new Date() } }).sort({ start: 1 }).toArray(),
  ]);

  const institution = institutionFor(user.email);
  const verifiedCampus = verified.get(user.id);
  const deliveryConfigured = !!(process.env.RESEND_API_KEY && process.env.CAMPUS_EMAIL_FROM);

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
        <p>Publish 30-minute slots at the same local time each week.</p>
        <ActionForm action={submit.bind(null, "publish")} localTime>
          <label>Start time<input name="start" type="datetime-local" required /></label>
          <label>Number of weeks
            <select name="weeks">{Array.from({ length: 8 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select>
          </label>
          <button className="primary" disabled={!profile?.teaches.length}>Publish availability</button>
        </ActionForm>
        {!profile?.teaches.length && <p>Add a skill you teach to publish slots.</p>}
        {slots.some((slot) => !slot.booking) && <p>Removing an open slot cancels its pending requests.</p>}
        {slots.length > 0 ? <ul className="slots">{slots.map((slot) => <li key={String(slot._id)}>
          <LocalTime start={slot.start.toISOString()} end={slot.end.toISOString()} /> · {slot.booking ? "Booked" : "Open"}
          {!slot.booking && <ActionForm action={submit.bind(null, "remove")}>
            <input type="hidden" name="slot" value={String(slot._id)} />
            <button>Remove slot</button>
          </ActionForm>}
        </li>)}</ul> : !!profile?.teaches.length && <p>No upcoming slots.</p>}
      </section>
      <section className="panel">
        <h2>Campus verification</h2>
        {verifiedCampus ? <p className="verified-badge">✓ Verified · {verifiedCampus}</p> : institution && deliveryConfigured ? <>
          <p>Verify your account email to display the {institution} badge.</p>
          <ActionForm action={submit.bind(null, "send-campus-code")}><button>Send verification code</button></ActionForm>
          <ActionForm action={submit.bind(null, "verify-campus-code")}>
            <label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required /></label>
            <button className="primary">Verify email</button>
          </ActionForm>
        </> : <p>{institution ? "Campus email delivery is currently unavailable." : "Verification is available for accounts with a supported institutional email."}</p>}
      </section>
    </div>
  </main>;
}
