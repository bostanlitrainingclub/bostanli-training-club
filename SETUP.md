# Bostanlı Training Club — setup guide

This is the real, hosted version of the gym management app — same features,
now backed by an actual database and real staff logins instead of Claude's
in-chat storage.

## What you need first

Three free accounts (see the earlier conversation for why each one):
- **github.com** — where this code will live
- **vercel.com** — runs the live website (sign in with your GitHub account)
- **supabase.com** — the database and login system

---

## Step 1 — Create your Supabase project

1. In Supabase, click **New Project**. Pick a name, set a database password
   (save it somewhere — you won't need it day-to-day, but keep it safe), and
   choose a region close to Turkey.
2. Once it's created, go to **SQL Editor** in the left sidebar, click
   **New query**, paste in the entire contents of `supabase-schema.sql`
   (included in this project), and click **Run**. This creates every table
   the app needs, plus the security rules that keep PTs restricted to their
   own schedule and payment data admin-only.
3. Go to **Project Settings → API**. You'll need three values from this page
   in the next step:
   - **Project URL**
   - **anon public** key
   - **service_role** key (click "reveal" — keep this one secret, never share it)

## Step 2 — Configure the app with your keys

1. Copy `.env.local.example` to a new file called `.env.local`.
2. Paste in the three values from Step 1, plus your site's URL (leave it as
   `http://localhost:3000` for now — you'll update it once deployed).

## Step 3 — Create your first Admin account (the one manual step)

The app has a real "invite a new staff member" screen — but that screen only
works if you're *already* logged in as an Admin. For the very first account,
there's a one-time manual step:

1. In Supabase, go to **Authentication → Users → Add user → Create new user**.
   Enter your own email and a password you'll actually use.
2. Copy the **User UID** shown for the account you just created.
3. Go back to **SQL Editor** and run this, replacing the two placeholders:

   ```sql
   insert into staff (id, auth_user_id, name, role)
   values ('admin_1', 'PASTE-THE-USER-UID-HERE', 'YOUR NAME', 'owner');
   ```

That's it — that account is now your permanent Admin login. From here on,
adding every other staff member (Admin or PT) happens through the app's own
"Antrenörler → Ekle" screen, which sends them a real email invite.

## Step 4 — Run it locally to make sure it all works

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, log in with the account from Step 3, and
click around — add a member, book a session, check that everything behaves
the way it did in the Claude version.

## Step 5 — Push to GitHub

Create a new repository on GitHub, then from inside this project folder:

```bash
git init
git add .
git commit -m "Initial version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

(`.env.local` is deliberately excluded via `.gitignore` — your keys should
never end up in GitHub. You'll enter them directly into Vercel instead.)

## Step 6 — Deploy on Vercel

1. In Vercel, click **Add New → Project**, and pick the GitHub repository
   you just pushed.
2. Before deploying, open **Environment Variables** and add the same four
   values from your `.env.local` file. For `NEXT_PUBLIC_SITE_URL`, use the
   `.vercel.app` address Vercel shows you (you can update this later if you
   buy a custom domain).
3. Click **Deploy**. In about a minute, you'll have a real, live URL.

## Ongoing updates

From here on, the flow is: describe the change, the code gets updated and
pushed to GitHub, and Vercel automatically rebuilds and republishes within
about a minute — no manual server work required.
