import { Suspense } from "react";
import type { Metadata } from "next";
import "./style.css";
import { currentUser } from "@/lib/session";
import Navigation from "./navigation";

export const metadata: Metadata = {
  title: "SkillSwap Ledger",
  description: "Discover skills and learn from your campus community.",
};

async function SessionNavigation() {
  let signedIn = false;
  try {
    signedIn = !!(await currentUser());
  } catch {
    // The page error boundary can recover independently of the navigation.
  }
  return <Navigation signedIn={signedIn} />;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="shell">
    <Suspense fallback={<Navigation signedIn={false} />}><SessionNavigation /></Suspense>
    {children}
  </div></body></html>;
}
