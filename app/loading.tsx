export default function Loading() {
  return (
    <main className="discover route-loading">
      <div className="loading-card" role="status">
        <span className="loading-mark" aria-hidden="true">
          ⇄
        </span>
        <p>Loading SkillSwap…</p>
      </div>
    </main>
  );
}
