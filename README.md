# SkillSwap Ledger

SkillSwap Ledger is a campus skill exchange built with Next.js App Router, TypeScript, Better Auth, and MongoDB. Members can teach or learn in 30-minute sessions and pay with credits earned through teaching.

## Local setup

1. Install Node.js 24 and run `npm ci`.
2. Copy `.env.example` to `.env.local`. Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32` and set `BETTER_AUTH_URL` to the origin you will open, typically `http://localhost:3000`.
3. Set `MONGODB_URI` to an Atlas cluster or a MongoDB replica set. A standalone MongoDB server cannot run the transactions required by SkillSwap. For a single-node development replica set, run the following commands in two terminals.

   ```sh
   mkdir -p /tmp/skillswap-mongo
   mongod --dbpath /tmp/skillswap-mongo --bind_ip 127.0.0.1 --replSet rs0
   ```

   ```sh
   mongosh --host 127.0.0.1 --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
   ```

   Wait for `db.hello().isWritablePrimary` in `mongosh` to return `true`, then use `mongodb://127.0.0.1:27017/?replicaSet=rs0`. The application needs permission to read and write collections and create indexes in `MONGODB_DATABASE`.
4. Run `npm run dev` and open your configured origin. Keep credentials in the ignored `.env.local` file or your deployment environment.

## Routes

| Route | What you can do |
| --- | --- |
| `/` | Search by name, campus, or skill, filter by category, and see a mutual match when both skill interests align. |
| `/account` | Sign up, sign in, or sign out with Better Auth. |
| `/profile` | Edit your campus profile and publish 30-minute teaching slots. |
| `/mentors/[id]` | View a mentor's skills and request an open session. |
| `/sessions` | Manage requests, upcoming sessions, and history. |
| `/wallet` | View available and reserved credits and the activity history. |

Each account starts with one credit. A mentor's acceptance reserves one credit and closes competing requests for the slot. When funds are insufficient, the request stays pending. Either participant can cancel before the start, releasing any reservation. After the session ends, both participants must confirm for the reserved credit to transfer. Sessions display in the viewer's local timezone.

## Three-account demo

1. Set `MONGODB_DATABASE=skillswap_demo` and choose a local `DEMO_PASSWORD` in `.env.local`. Run `npm run seed:demo`, then start or restart the app. The seed creates Rafi (`rafi@example.test`, React), Anika (`anika@example.test`, Python), and Nila (`nila@example.test`, Figma). All three use your local demo password. Rerunning the seed refreshes the demo profiles and adds availability when a member has no future open slot. It preserves balances and booking history.
2. Sign in as Anika and request React from Rafi. Rafi accepts in My Sessions. After the slot ends, confirm on both accounts. Rafi's available balance goes from one to two.
3. Sign in as Rafi and request Figma from Nila. Nila accepts. Rafi now has one available credit and one reserved credit. After the session ends, confirm on both accounts and verify that Nila receives the credit and Rafi's reservation clears.

Use separate browser profiles or sign out between accounts. The seeded slots start roughly 5, 50, and 95 minutes from seeding. You can publish different times from each member's profile. The automated integration test runs the exchange without waiting for real slots to end and spends Rafi's starter credit first, so the Figma request requires the React earnings.

## Verification

Run `npm run build`, `npm run check`, and `npm test`. The booking integration test uses `MONGODB_URI` from the environment or local env files and creates and drops a randomly named test database. Use a local development replica set or a dedicated test deployment with those permissions. Without a configured URI, the transaction test is skipped and the mutual-match test still runs.
