"use client";

import Link from "next/link";
import { useState } from "react";
import type { Profile } from "@/lib/profiles";

type Mentor = Profile & {
  verifiedCampus?: string;
  available: boolean;
  match: { offered: string; wanted: string } | null;
};
const categories = ["All", "Development", "Design", "Other"];

function categoryFor(skill: string) {
  if (
    /figma|design|sketch|illustrat|photoshop|typography|ux\b|ui\b/i.test(skill)
  )
    return "Design";
  if (
    /react|python|javascript|typescript|programming|coding|web dev|node|html|css|java\b|ruby|golang|rust|sql/i.test(
      skill,
    )
  )
    return "Development";
  return "Other";
}

function Portrait({ name }: { name: string }) {
  return (
    <div className="portrait" aria-hidden="true">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => Array.from(part)[0])
        .join("")}
    </div>
  );
}

export default function Discover({
  mentors,
  needsProfile,
}: {
  mentors: Mentor[];
  needsProfile: boolean;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [openOnly, setOpenOnly] = useState(false);
  const [campus, setCampus] = useState("");
  const campuses = new Map(
    mentors.map((mentor) => [mentor.campus.toLowerCase(), mentor.campus]),
  );
  const query = search.normalize("NFKC").trim().toLowerCase();
  const visible = mentors.filter(
    (mentor) =>
      (!openOnly || mentor.available) &&
      (!campus || mentor.campus.toLowerCase() === campus) &&
      (category === "All" ||
        mentor.teaches.some((skill) => categoryFor(skill) === category)) &&
      [mentor.name, mentor.campus, ...mentor.teaches, ...mentor.learns].some(
        (value) => value.toLowerCase().includes(query),
      ),
  );
  const matched = visible.find((mentor) => mentor.match);
  const filtered = !!query || category !== "All" || openOnly || !!campus;

  function resetFilters() {
    setSearch("");
    setCategory("All");
    setOpenOnly(false);
    setCampus("");
  }

  return (
    <main className="discover">
      <header className="intro">
        <div className="intro-copy">
          <p className="eyebrow">Campus skill exchange</p>
          <h1>
            Find your <em>next skill.</em>
          </h1>
          <p>Learn from someone on campus. Share what you know in return.</p>
          <div className="mentor-search">
            <span aria-hidden="true" className="search-icon" />
            <input
              type="search"
              aria-label="Search mentors, skills, and campuses"
              placeholder="Search skills or names…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="intro-art" aria-hidden="true" />
      </header>
      {needsProfile && (
        <div className="profile-notice">
          <span>
            Add the skills you teach and want to learn to see mutual matches.
          </span>
          <Link href="/profile">
            Edit your profile <span aria-hidden="true">↗</span>
          </Link>
        </div>
      )}
      {matched?.match && (
        <section className="match" aria-labelledby="match-heading">
          <div>
            <h2 id="match-heading">Mutual match</h2>
            <div className="exchange">
              <span>
                You teach <strong>{matched.match.offered}</strong>
              </span>
              <span className="exchange-mark" aria-hidden="true">
                ⇄
              </span>
              <span>
                {matched.name} teaches <strong>{matched.match.wanted}</strong>
              </span>
            </div>
          </div>
          <div className="match-mentor">
            <Portrait name={matched.name} />
            <div>
              <h3>{matched.name}</h3>
              <p>{matched.campus}</p>
            </div>
            <Link className="button" href={`/mentors/${matched._id}`}>
              View profile <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>
      )}
      <section className="mentor-section" aria-labelledby="mentor-heading">
        <div className="section-heading">
          <h2 id="mentor-heading">Discover mentors</h2>
          <p role="status">
            {visible.length} {visible.length === 1 ? "mentor" : "mentors"}
          </p>
        </div>
        <div className="filter-bar">
          <div className="filters" aria-label="Skill categories">
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mentor-options">
            {campuses.size > 0 && (
              <select
                aria-label="Campus"
                value={campus}
                onChange={(event) => setCampus(event.target.value)}
              >
                <option value="">All campuses</option>
                {[...campuses]
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
              </select>
            )}
            <label className="availability-filter">
              <input
                type="checkbox"
                checked={openOnly}
                onChange={(event) => setOpenOnly(event.target.checked)}
              />{" "}
              Open slots only
            </label>
          </div>
        </div>
        <div className="mentors">
          {visible.map((mentor) => (
            <article key={mentor._id}>
              <div className="mentor-identity">
                <Portrait name={mentor.name} />
                <div>
                  <h3>{mentor.name}</h3>
                  <p>{mentor.campus}</p>
                </div>
              </div>
              {mentor.verifiedCampus && <span className="verified-badge">✓ Verified · {mentor.verifiedCampus}</span>}
          {mentor.bio && <p className="mentor-bio">{mentor.bio}</p>}
              <dl className="mentor-skills">
                <div>
                  <dt>Teaches</dt>
                  <dd>
                    {mentor.teaches.map((skill) => (
                      <span className="teach" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </dd>
                </div>
                {!!mentor.learns.length && (
                  <div>
                    <dt>Learning</dt>
                    <dd>
                      {mentor.learns.map((skill) => (
                        <span className="learn" key={skill}>
                          {skill}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mentor-footer">
                <span
                  className={
                    mentor.available ? "availability is-open" : "availability"
                  }
                >
                  {mentor.available ? "Open slots" : "No open slots"}
                </span>
                <Link className="profile-link" href={`/mentors/${mentor._id}`}>
                  View profile <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
        {!visible.length && (
          <div className="panel empty-state">
            <h3>
              {mentors.length
                ? "No mentors match these filters"
                : "No mentors have published teaching skills yet."}
            </h3>
            {filtered && (
              <button type="button" onClick={resetFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
