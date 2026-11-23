import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, getAuth } from "./auth";
import { ensureWallet } from "./booking";

export const currentUser = cache(async () => {
  const requestHeaders = await headers();
  if (!authConfigured()) throw new Error("SkillSwap is missing server configuration.");
  const user = (await getAuth().api.getSession({ headers: requestHeaders }))?.user ?? null;
  if (user) await ensureWallet(user.id);
  return user;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/account");
  return user;
}
