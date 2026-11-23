import { getDatabase } from "./db.ts";

export class ProfileError extends Error {}

export type Profile = {
  _id: string;
  name: string;
  campus: string;
  bio: string;
  teaches: string[];
  learns: string[];
};

export function profiles() {
  return getDatabase().db.collection<Profile>("profiles");
}

export function skillKey(skill: string) {
  return skill.toLowerCase();
}

function field(data: FormData, name: string, max: number, required = false) {
  const value = data.get(name);
  if (typeof value !== "string") throw new ProfileError("Invalid profile field.");
  const normalized = value.normalize("NFKC").trim();
  if ((required && !normalized) || normalized.length > max) {
    throw new ProfileError(`${name} must contain ${required ? "1" : "0"}–${max} characters.`);
  }
  return normalized;
}

function skills(data: FormData, name: string) {
  const unique = new Map<string, string>();
  for (const part of field(data, name, 800).split(/[,\n]/)) {
    const skill = part.trim().replace(/\s+/g, " ");
    if (skill.length > 50) throw new ProfileError("Each skill must be at most 50 characters.");
    if (skill && !unique.has(skillKey(skill))) unique.set(skillKey(skill), skill);
  }
  if (unique.size > 12) throw new ProfileError("Enter at most 12 skills per list.");
  return [...unique.values()];
}

export async function saveProfile(userId: string, data: FormData) {
  const profile = {
    name: field(data, "name", 80, true),
    campus: field(data, "campus", 80, true),
    bio: field(data, "bio", 400),
    teaches: skills(data, "teaches"),
    learns: skills(data, "learns"),
  };
  await profiles().updateOne({ _id: userId }, { $set: profile }, { upsert: true });
}

export function mutualMatch(viewer: Profile, mentor: Profile) {
  const offered = viewer.teaches.find((skill) => mentor.learns.some((wanted) => skillKey(wanted) === skillKey(skill)));
  const wanted = mentor.teaches.find((skill) => viewer.learns.some((item) => skillKey(item) === skillKey(skill)));
  return offered && wanted ? { offered, wanted } : null;
}
