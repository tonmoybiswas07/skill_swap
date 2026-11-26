import type { Document, Filter } from "mongodb";
import { verifiedInstitutions } from "@/lib/campus";
import { mutualMatch, profiles, type Profile } from "@/lib/profiles";
import { currentUser } from "@/lib/session";
import Discover from "./discover";

const pageSize = 12;
const design = /figma|design|sketch|illustrat|photoshop|typography|ux\b|ui\b/i;
const development = /react|python|javascript|typescript|programming|coding|web dev|node|html|css|java\b|ruby|golang|rust|sql/i;

type Search = Record<string, string | string[] | undefined>;
type RankedMentor = Profile & { nextSlot?: Date; matched: boolean };

function parameter(params: Search, key: string, length: number) {
  const value = params[key];
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, length) : "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesSkills(field: string, skills: string[]) {
  if (!skills.length) return false;
  const regex = new RegExp(`^(?:${skills.map(escapeRegex).join("|")})$`, "i");
  return { $anyElementTrue: [{ $map: {
    input: field, as: "skill", in: { $regexMatch: { input: "$$skill", regex } },
  } }] };
}

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [user, params] = await Promise.all([currentUser(), searchParams]);
  const query = parameter(params, "q", 100);
  const campus = parameter(params, "campus", 80);
  const rawCategory = parameter(params, "category", 20);
  const category = ["Development", "Design", "Other"].includes(rawCategory) ? rawCategory : "";
  const open = params.open === "1";
  const requestedPage = Number(parameter(params, "page", 10));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const directory = profiles();
  const eligible = { _id: { $ne: user?.id ?? "" }, "teaches.0": { $exists: true } };
  const [viewer, campusNames] = await Promise.all([
    user ? directory.findOne({ _id: user.id }) : null,
    directory.distinct("campus", eligible),
  ]);
  const campuses = [...new Map(campusNames.map((name) => [name.toLowerCase(), name])).values()].sort((a, b) => a.localeCompare(b));
  const filters: Filter<Profile>[] = [eligible];
  if (campus) filters.push({ campus: new RegExp(`^${escapeRegex(campus)}$`, "i") });
  if (query) {
    const regex = new RegExp(escapeRegex(query), "i");
    filters.push({ $or: [{ name: regex }, { campus: regex }, { teaches: regex }, { learns: regex }] });
  }
  if (category === "Design") filters.push({ teaches: design });
  if (category === "Development") filters.push({ teaches: { $elemMatch: { $regex: development, $not: design } } });
  if (category === "Other") {
    const known = new RegExp(`${design.source}|${development.source}`, "i");
    filters.push({ teaches: { $elemMatch: { $not: known } } });
  }

  const now = new Date();
  const pipeline: Document[] = [
    { $match: { $and: filters } },
    { $lookup: {
      from: "slots", localField: "_id", foreignField: "mentor", as: "availability",
      pipeline: [
        { $match: { start: { $gt: now }, booking: { $exists: false } } },
        { $sort: { start: 1 } }, { $limit: 1 }, { $project: { start: 1 } },
      ],
    } },
    { $set: {
      nextSlot: { $arrayElemAt: ["$availability.start", 0] },
      hasAvailability: { $gt: [{ $size: "$availability" }, 0] },
      matched: { $and: [
        matchesSkills("$learns", viewer?.teaches ?? []),
        matchesSkills("$teaches", viewer?.learns ?? []),
      ] },
    } },
    ...(open ? [{ $match: { hasAvailability: true } }] : []),
    { $sort: { matched: -1, hasAvailability: -1, nextSlot: 1, name: 1, _id: 1 } },
    { $skip: (page - 1) * pageSize }, { $limit: pageSize + 1 },
    { $project: { availability: 0, hasAvailability: 0 } },
  ];
  const results = await directory.aggregate<RankedMentor>(pipeline).toArray();
  const mentors = results.slice(0, pageSize);
  const verified = await verifiedInstitutions(mentors.map((mentor) => mentor._id));
  return <Discover
    filters={{ query, campus, category, open, page }}
    campuses={campuses} hasNext={results.length > pageSize}
    needsProfile={!!user && (!viewer || !viewer.teaches.length || !viewer.learns.length)}
    mentors={mentors.map((mentor) => ({
      ...mentor, verifiedCampus: verified.get(mentor._id),
      nextSlot: mentor.nextSlot?.toISOString(), match: viewer ? mutualMatch(viewer, mentor) : null,
    }))}
  />;
}
