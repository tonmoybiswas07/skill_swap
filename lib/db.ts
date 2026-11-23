import { MongoClient } from "mongodb";

let client: MongoClient | undefined;

export function getDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI.");
  client ??= new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  return { client, db: client.db(process.env.MONGODB_DATABASE || "skillswap") };
}
