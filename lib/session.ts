import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { ensureWallet } from "./booking";

export const currentUser = cache(async () => {
  const requestHeaders = await headers();
  if (!process.env.MONGODB_URI || !process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) return null;
  const user = (await getAuth().api.getSession({ headers: requestHeaders }))?.user ?? null;
  if (user) await ensureWallet(user.id);
  return user;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/account");
  return user;
}
