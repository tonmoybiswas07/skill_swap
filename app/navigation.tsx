"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "Discover", glyph: "◈" },
  { href: "/profile", label: "Profile", glyph: "◎" },
  { href: "/sessions", label: "Sessions", glyph: "▦" },
  { href: "/wallet", label: "Wallet", glyph: "▤" },
  { href: "/account", label: "Account", glyph: "◉" },
];

export default function Navigation({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const links = signedIn ? destinations : destinations.filter(({ href }) => href === "/" || href === "/account");

  return <aside className="sidebar">
    <Link className="brand" href="/" aria-label="SkillSwap Ledger home">
      <span className="brand-mark" aria-hidden="true">⇄</span>
      <span>SkillSwap<span className="brand-subtitle">Ledger</span></span>
    </Link>
    <nav aria-label="Main navigation">
      {links.map(({ href, label, glyph }) => <Link key={href} href={href}
        aria-current={path === href || (href === "/" && path.startsWith("/mentors/")) ? "page" : undefined}>
        <span className="nav-glyph" aria-hidden="true">{glyph}</span>
        {label}
      </Link>)}
    </nav>
    {!signedIn && <Link className="sidebar-account" href="/account">Join the exchange <span aria-hidden="true">↗</span></Link>}
  </aside>;
}
