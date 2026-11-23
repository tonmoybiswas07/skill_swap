import type { Metadata } from "next";
import "./style.css";
import { currentUser } from "@/lib/session";
import Navigation from "./navigation";

export const metadata: Metadata = {
  title: "SkillSwap Ledger",
  description: "Discover skills and learn from your campus community.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();
  return <html lang="en"><body><div className="shell"><Navigation signedIn={!!user} />{children}</div></body></html>;
}
