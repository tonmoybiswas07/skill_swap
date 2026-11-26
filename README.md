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
| `/` | Search by name, campus, or skill, filter by category, campus, or availability, and share filtered results by URL. Results prioritize mutual matches and the earliest open slots. |
| `/account` | Sign up, sign in, or sign out with Better Auth. |
| `/profile` | Edit and verify your campus profile. Publish up to eight weekly 30-minute slots at once or remove unbooked slots. |
| `/mentors/[id]` | View a mentor's skills and request an open session. |
| `/sessions` | Manage requests, upcoming sessions, and history. Download upcoming accepted sessions as calendar events (.ics), report issues, and leave feedback after completion. |
| `/inbox` | Read booking updates and see sessions starting in the next 24 hours. |
| `/moderation` | Review and resolve reports if your account is configured as a moderator. |
| `/wallet` | View available and reserved credits and the activity history. |

Each account starts with one credit. A mentor's acceptance reserves one credit and closes competing requests for the slot. When funds are insufficient, the request stays pending. Either participant can cancel before the start, releasing any reservation. After the session ends, both participants must confirm for the reserved credit to transfer. Sessions display in the viewer's local timezone.

## Production deployment

Build and run the app on a Node.js 24 host that supports Next.js server routes and server actions. Use `npm ci`, `npm run build`, and `npm start` on a Node server, or select the Next.js preset on a managed host.

| Server variable | Production value |
| --- | --- |
| `BETTER_AUTH_URL` | The canonical public HTTPS origin users open, including its scheme and with no path. Point users to this domain for sign-in. |
| `BETTER_AUTH_SECRET` | A deployment-specific secret generated with `openssl rand -base64 32`. Keep it stable across app instances and releases. |
| `MONGODB_URI` | A private connection string for Atlas or another transaction-capable MongoDB replica set or sharded deployment. Allow the hosting environment to reach the cluster. |
| `MONGODB_DATABASE` | The production database name. Set it explicitly and use database credentials scoped to this database with collection and index permissions. |

Set these values in the host's server-side environment or secret manager. Keep credentials and local env files out of Git. Use a separate database and auth origin for previews where you test sign-in. Seed only an isolated demo environment with `MONGODB_DATABASE=skillswap_demo`. Supply `DEMO_PASSWORD` privately to the seed command and share it only with the people testing the demo.

## Optional services

- **Disputes.** Set `DISPUTE_MODERATOR_IDS` to a comma-separated list of trusted Better Auth user IDs. These are the string forms of the users' MongoDB `user._id` values. An accepted session can be reported after it ends when an independent moderator is configured. The moderator reviews the reason and either releases the reservation back to the learner or transfers the credit to the mentor. Participants cannot resolve their own reports.
- **Campus verification.** Set `CAMPUS_EMAIL_DOMAINS` to exact domain-to-name pairs, such as `university.edu=Example University,college.edu=Example College`. Set `RESEND_API_KEY` and `CAMPUS_EMAIL_FROM` to use a [verified Resend sender](https://resend.com/docs/api-reference/emails/send-email). Members request a short-lived code sent to their account email. The verified institution appears publicly. Email addresses and verification codes stay private.
- **Notifications.** Booking updates and 24-hour reminders appear in the signed-in member's Inbox. The reminders are calculated when the Inbox is opened.
- **Feedback.** The learner can leave one rating and an optional public comment per completed session. Mentor pages show recent feedback without showing the reviewer's identity.

## Three-account demo

1. Set `MONGODB_DATABASE=skillswap_demo` and choose a local `DEMO_PASSWORD` in `.env.local`. Run `npm run seed:demo`, then start or restart the app. The seed creates Rafi (`rafi@example.test`, React), Anika (`anika@example.test`, Python), and Nila (`nila@example.test`, Figma). All three use your local demo password. Rerunning the seed refreshes the demo profiles and adds availability when a member has no future open slot. It preserves balances and booking history.
2. Sign in as Anika and request React from Rafi. Rafi accepts in My Sessions. After the slot ends, confirm on both accounts. Rafi's available balance goes from one to two.
3. Sign in as Rafi and request Figma from Nila. Nila accepts. Rafi now has one available credit and one reserved credit. After the session ends, confirm on both accounts and verify that Nila receives the credit and Rafi's reservation clears.

Use separate browser profiles or sign out between accounts. The seeded slots start roughly 5, 50, and 95 minutes from seeding. You can publish different times from each member's profile. To prove that the earned credit funds Figma, first have Rafi spend his starter credit on Anika’s Python session. Then have Rafi request Figma. Nila’s acceptance should report insufficient credit and leave the request pending. Complete the React session, then retry Nila’s acceptance. Rafi’s wallet should show `0 available / 1 reserved` until both accounts confirm Figma, then `0 available / 0 reserved`. The integration test covers this flow without waiting for real slots to end.

## Verification

Run `npm run build`, `npm run check`, and `npm test`. The booking integration test uses `TEST_MONGODB_URI` from the environment or local env files and creates and drops a randomly named test database. Use a local development replica set or a dedicated test deployment with those permissions. Without `TEST_MONGODB_URI`, the transaction test is skipped and the mutual-match test still runs.

## Session maintenance

Run `npm run maintain:sessions` on the same database as the app every five minutes using your host's scheduled jobs. The job expires past pending requests, adds an Inbox reminder after an accepted session ends, and refunds the learner if 72 hours pass after the end without both confirmations. A report submitted within that window keeps the credit reserved for moderator review. The deadline also applies to existing accepted bookings. The first run processes any overdue reservations.

Set `SESSION_REMINDER_FROM` to a verified Resend sender and provide `RESEND_API_KEY` and `BETTER_AUTH_URL` to enable email reminders. The job sends a 24-hour reminder between 24 and 1 hours before the session, and a 1-hour reminder during the last hour. It checks the booking status before delivery and uses Resend idempotency keys and database delivery markers for retries.

Mentors can add an HTTPS meeting link or a campus location when accepting a booking. The meeting details appear in My Sessions for the participants and in their calendar download.
