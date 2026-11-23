"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

export default function RouteError({ reset }: { reset: () => void }) {
  const router = useRouter();

  return <main className="discover">
    <h1>SkillSwap is temporarily unavailable</h1>
    <p role="alert">We couldn’t load this page. Try again in a moment.</p>
    <div className="session-actions notice">
      <button className="primary" onClick={() => startTransition(() => {
        router.refresh();
        reset();
      })}>Try again</button>
      <Link className="button" href="/">Go to Discover</Link>
    </div>
  </main>;
}
