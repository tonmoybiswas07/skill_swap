import { collections } from "@/lib/booking";
import { mutualMatch, profiles } from "@/lib/profiles";
import { currentUser } from "@/lib/session";
import Discover from "./discover";

export default async function DiscoverPage() {
  const user = await currentUser();
  const [viewer, mentors, openMentors] = await Promise.all([
    user ? profiles().findOne({ _id: user.id }) : null,
    profiles().find({ _id: { $ne: user?.id ?? "" }, "teaches.0": { $exists: true } }).sort({ name: 1 }).toArray(),
    collections().slots.distinct("mentor", { start: { $gt: new Date() }, booking: { $exists: false } }),
  ]);
  const available = new Set(openMentors);

  return <Discover needsProfile={!!user && (!viewer || !viewer.teaches.length || !viewer.learns.length)}
    mentors={mentors.map((mentor) => ({
      ...mentor, available: available.has(mentor._id), match: viewer ? mutualMatch(viewer, mentor) : null,
    }))} />;
}
