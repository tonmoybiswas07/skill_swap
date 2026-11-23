import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { getDatabase } from "./db.ts";
import { ensureWallet } from "./booking.ts";

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || !baseURL) throw new Error("Set BETTER_AUTH_SECRET and BETTER_AUTH_URL.");
  const { client, db } = getDatabase();

  return betterAuth({
    secret,
    baseURL,
    database: mongodbAdapter(db, { client }),
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await ensureWallet(user.id);
            } catch (error) {
              console.error("Starter credit provisioning failed", error instanceof Error ? error.name : "Unknown error");
            }
          },
        },
      },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  auth ??= createAuth();
  return auth;
}
