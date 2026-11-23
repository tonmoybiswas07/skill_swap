"use client";

import Link from "next/link";
import { useState } from "react";
import type { Profile } from "@/lib/profiles";

type Mentor = Profile & { available: boolean; match: { offered: string; wanted: string } | null };
const categories = ["All", "Development", "Design", "Other"];

function categoryFor(skill: string) {
  if (/figma|design|sketch|illustrat|photoshop|typography|ux\b|ui\b/i.test(skill)) return "Design";
  if (/react|python|javascript|typescript|programming|coding|web dev|node|html|css|java\b|ruby|golang|rust|sql/i.test(skill)) return "Development";
  return "Other";
}

function Portrait({ name }: { name: string }) {
  return <div className="portrait initials" aria-hidden="true">{name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("")}</div>;
}

export default function Discover({ mentors, needsProfile }: { mentors: Mentor[]; needsProfile: boolean }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const query = search.normalize("NFKC").trim().toLowerCase();
  const visible = mentors.filter((mentor) =>
    (category === "All" || mentor.teaches.some((skill) => categoryFor(skill) === category)) &&
    [mentor.name, mentor.campus, ...mentor.teaches, ...mentor.learns].some((value) => value.toLowerCase().includes(query))
  );
  const matched = visible.find((mentor) => mentor.match);

  return <main className="discover">
    <header className="intro">
      <p className="eyebrow">CAMPUS SKILL EXCHANGE</p>
      <h1>Find your next skill</h1>
      <input type="search" aria-label="Search mentors, skills, and campuses" placeholder="Search React, Figma, Python…" value={search} onChange={(event) => setSearch(event.target.value)} />
    </header>
    {needsProfile && <p className="notice"><Link href="/profile">Add the skills you teach and want to learn</Link> to see mutual matches.</p>}
    {matched?.match && <section className="match" aria-labelledby="match-heading">
      <div>
        <h2 id="match-heading">Mutual match</h2>
        <div className="exchange">
          <span>You teach <strong>{matched.match.offered}</strong></span><span aria-hidden="true">⇄</span>
          <span>{matched.name} teaches <strong>{matched.match.wanted}</strong></span>
        </div>
      </div>
      <div className="match-mentor">
        <Portrait name={matched.name} />
        <div><h3>{matched.name}</h3><p>{matched.campus}</p><Link className="button primary" href={`/mentors/${matched._id}`}>View profile</Link></div>
      </div>
    </section>}
    <section className="mentor-section" aria-labelledby="mentor-heading">
      <h2 id="mentor-heading">Discover mentors</h2>
      <div className="filters" aria-label="Skill categories">
        {categories.map((item) => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
      </div>
      <div className="mentors">
        {visible.map((mentor) => <article key={mentor._id}>
          <Portrait name={mentor.name} />
          <div className="mentor-details">
            <h3>{mentor.name}</h3>
            <p>{mentor.campus}{mentor.available && " · Open slots"}</p>
            <p><span className="teach">Teaches {mentor.teaches.join(", ")}</span></p>
            {!!mentor.learns.length && <p><span className="learn">Learning {mentor.learns.join(", ")}</span></p>}
            <Link className="button" href={`/mentors/${mentor._id}`}>View profile</Link>
          </div>
        </article>)}
      </div>
      {!visible.length && <p role="status">{mentors.length ? "No mentors match your search." : "No mentors have published teaching skills yet."}</p>}
    </section>
  </main>;
}
