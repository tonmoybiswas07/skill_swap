"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigation({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const links = signedIn
    ? [["/", "Discover"], ["/profile", "Profile"], ["/sessions", "Sessions"], ["/wallet", "Wallet"], ["/account", "Account"]]
    : [["/", "Discover"], ["/account", "Account"]];

  return <aside>
    <Link className="brand" href="/">SkillSwap Ledger</Link>
    <nav aria-label="Main navigation">
      {links.map(([href, label]) => <Link key={href} href={href}
        aria-current={path === href || (href === "/" && path.startsWith("/mentors/")) ? "page" : undefined}>
        {label}
      </Link>)}
    </nav>
  </aside>;
}
