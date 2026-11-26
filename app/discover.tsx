import Link from "next/link";
import { LocalTime } from "./interactive";
import type { Profile } from "@/lib/profiles";

type Mentor = Profile & {
  verifiedCampus?: string;
  nextSlot?: string;
  match: { offered: string; wanted: string } | null;
};
const categories = ["All", "Development", "Design", "Other"];

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

type Filters = { query: string; campus: string; category: string; open: boolean; page: number };

function pageURL(filters: Filters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.category) params.set("category", filters.category);
  if (filters.campus) params.set("campus", filters.campus);
  if (filters.open) params.set("open", "1");
  if (page > 1) params.set("page", String(page));
  return params.size ? `/?${params}` : "/";
}

export default function Discover({
  mentors, needsProfile, filters, campuses, hasNext,
}: {
  mentors: Mentor[];
  needsProfile: boolean;
  filters: Filters;
  campuses: string[];
  hasNext: boolean;
}) {
  const { query, category, campus, open, page } = filters;
  const matched = mentors.find((mentor) => mentor.match);
  const filtered = !!(query || category || campus || open);

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
              name="q"
              form="mentor-filters"
              maxLength={100}
              defaultValue={query}
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
          <p>Page {page}</p>
        </div>
        <form action="/" id="mentor-filters" className="filter-bar">
          <div className="mentor-options">
            <select name="category" aria-label="Skill category" defaultValue={category}>
              {categories.map((item) => <option key={item} value={item === "All" ? "" : item}>{item}</option>)}
            </select>
            <select name="campus" aria-label="Campus" defaultValue={campus}>
              <option value="">All campuses</option>
              {campus && !campuses.includes(campus) && <option>{campus}</option>}
              {campuses.map((name) => <option key={name}>{name}</option>)}
            </select>
            <label className="availability-filter">
              <input type="checkbox" name="open" value="1" defaultChecked={open} /> Open slots only
            </label>
            <button type="submit">Search</button>
            {filtered && <Link href="/">Clear filters</Link>}
          </div>
        </form>
        <div className="mentors">
          {mentors.map((mentor) => (
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
                    mentor.nextSlot ? "availability is-open" : "availability"
                  }
                >
                  {mentor.nextSlot ? <>Next slot · <LocalTime start={mentor.nextSlot} /></> : "No open slots"}
                </span>
                <Link className="profile-link" href={`/mentors/${mentor._id}`}>
                  View profile <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
        {!mentors.length && (
          <div className="panel empty-state">
            <h3>
              {page > 1 ? "No mentors on this page" : filtered ? "No mentors match these filters" : "No mentors have published teaching skills yet."}
            </h3>
          </div>
        )}
        {(page > 1 || hasNext) && <nav className="session-actions" aria-label="Mentor result pages">
          {page > 1 && <Link className="button" href={pageURL(filters, page - 1)}>Previous page</Link>}
          {hasNext && <Link className="button" href={pageURL(filters, page + 1)}>Next page</Link>}
        </nav>}
      </section>
    </main>
  );
}
