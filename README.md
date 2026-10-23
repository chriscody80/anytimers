# Anytimer Tab

Track bets with your friends and who holds anytimers on whom. One anytimer = the holder can make the loser drink a 12 oz beer, any time.

- **Crews**: private groups. Only people with your invite link can join or see anything.
- **Bets**: you challenge a friend, they accept, either side reports the result, and the other side confirms it. A confirmed win issues the anytimers automatically.
- **Anytimers**: the holder calls one in, and the person who owes taps "Done, I drank it" (or the holder marks it done).
- **Live**: everyone's screen updates when anything changes.
- **Photos**: proof of every 12 oz. Either person on a paid anytimer can add up to 4 photos; they show in the feed and on the crew's photo wall. Photos are private to the crew and shrunk on the phone before upload.
- **Notifications**: a ping when you're challenged, a result needs your confirmation, an anytimer is called on you, and more. Works on Android in Chrome and on iPhone once the app is added to the Home Screen.
- **House rules** page per crew, standings, and a recent-activity feed.

Built with Next.js and Supabase (Postgres, email sign-in, realtime). The rules of the game are enforced in the database (`supabase/migrations/0001_init.sql`), so nobody can fake a bet from the browser.

---

## Put it online (about 10 minutes)

### 1. Create the database (Supabase)

1. Sign up at [supabase.com](https://supabase.com) and create a new project (the free plan is fine). Save the database password somewhere, though you won't need it for this.
2. Open **SQL Editor**, paste the whole contents of `supabase/migrations/0001_init.sql`, and click **Run**. You should see "Success. No rows returned." Then do the same, in order, with every other file in that folder (`0002_google_names.sql`, `0003_drink_photos.sql`, `0004_push_notifications.sql`, `0005_admin_delete_bets.sql`, …). Each new feature that needs a database change comes as a new numbered file you run once.
3. Open **Project Settings → API Keys** (or the **Connect** button) and copy:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **publishable key** (starts with `sb_publishable_`). On older projects this is the **anon** key, which also works.

### 2. Put the site on Vercel

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project**, pick the `anytimers` repo, and open **Environment Variables**. Add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |

3. Click **Deploy**. When it finishes you get a URL like `https://anytimers-xyz.vercel.app`.

### 3. Point sign-in at your site (Supabase)

1. **Authentication → URL Configuration**
   - **Site URL**: your Vercel URL
   - **Redirect URLs**: add `https://YOUR-VERCEL-URL/auth/callback`
2. **Authentication → Emails**: edit **both** the **Confirm signup** template (sent the first time someone signs in) and the **Magic Link** template (sent every time after). Replace each body with this so the email includes a 6-digit code. This link works in any browser (Supabase's default link only works in the browser where you asked for the email), and the code is a backup.

   ```html
   <h2>Your Anytimer Tab sign-in</h2>
   <p>Your code: <strong style="font-size:22px;letter-spacing:3px">{{ .Token }}</strong></p>
   <p>Or tap this link: <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
   ```

### 4. Turn on "Continue with Google" (recommended)

Google sign-in means no emails at all, so no email limits. It takes about 5 minutes in Google Cloud.

1. In Supabase, open **Authentication → Sign In / Providers → Google** and copy the **Callback URL** it shows (looks like `https://abcd1234.supabase.co/auth/v1/callback`). Leave the tab open.
2. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project (name it "Anytimers").
3. Open **Google Auth Platform** (or **APIs & Services → OAuth consent screen**) and fill in the branding: app name "Anytimer Tab", your email as support and developer contact, audience **External**.
4. Under **Audience**, click **Publish app** so anyone can sign in. (In "Testing" mode only people you list by email can.) It only asks for name and email, so Google doesn't need to review it.
5. Under **Clients**, **Create client** → **Web application**:
   - **Authorized JavaScript origins**: your Vercel URL, e.g. `https://anytimers.vercel.app`
   - **Authorized redirect URIs**: the Supabase Callback URL from step 1
6. Copy the **Client ID** and **Client secret** into the Supabase Google provider, switch it on, and save.

Tip: Google blocks sign-in inside some apps' built-in browsers (Instagram, Facebook Messenger). If a friend sees "disallowed_useragent", have them open the link in Safari or Chrome.

### 5. Turn on notifications

1. Generate signing keys once (on your computer): `npx web-push generate-vapid-keys`
2. In Vercel → **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key |
   | `VAPID_PRIVATE_KEY` | the private key (keep it secret) |
   | `VAPID_SUBJECT` | `mailto:you@example.com` |

3. Redeploy (Deployments → ⋯ → Redeploy). Environment variables only take effect on a new deploy.
4. Each person opens the app, goes to the **Crew** tab → **Notifications** → **Turn on notifications**, and taps **Allow**. On iPhone this only works from the Home Screen app: in Safari tap **Share → Add to Home Screen**, then open it from the icon.

That's it. Open your Vercel URL, sign in, start a crew, and send the invite link from the **Crew** tab to your friends.

### Heads-up: email limits

Supabase's built-in email sender only allows a few sign-in emails per hour, which is fine for testing but can bite when the whole group signs up at once. If people see "Too many emails sent", connect a free sending service (for example Resend) under **Authentication → Emails → SMTP Settings**. People stay signed in after the first time, so this mostly matters on day one.

---

## Run it on your computer

```bash
cp .env.example .env.local   # then fill in the two values
npm install
npm run dev
```

Open http://localhost:3000. Add `http://localhost:3000/auth/callback` to Supabase's Redirect URLs if you want the email link to work locally (the code works either way).

## How the pieces fit

| Path | What it is |
|---|---|
| `supabase/migrations/0001_init.sql` | Tables, row-level security, and every game action as a database function |
| `src/app/actions.ts` | Server actions that call those functions |
| `src/app/c/[crewId]/` | The Tab, Bets, Crew and Rules pages |
| `src/components/live.tsx` | Realtime refresh, tab bar, invite sharing |
| `src/proxy.ts` | Keeps the sign-in session fresh |

### Bet lifecycle

```
proposed ──accept──▶ open ──report result──▶ pending_result ──confirm──▶ settled / push / void
    │                  ▲                            │
    └─pass/withdraw─▶ declined/void                 └──dispute or take back──┘
```

A settled win creates one anytimer per stake: `outstanding ──call in──▶ called ──drank──▶ redeemed`.

## Ideas for later

- Per-night limit on calling anytimers on the same person
