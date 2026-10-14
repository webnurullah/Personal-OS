# Show your Google Calendar events in the Calendar page — setup guide

**What you get:** all events of all your Google calendars (your main one, Work, Birthdays, calendars shared with you …) also appear in the app's **Calendar** page: as small coloured chips in each day (dots on a phone), in the day's list under "Google Calendar", and in "Coming up". They are **read-only**: tap one and it opens in Google Calendar, where you change it. Your own app events are not touched.

**What the app can see:** only "See your calendars" (read-only) and your email address. It cannot change, add or delete anything in Google. You can remove the link at any time: **Settings → Integrations → Disconnect**, or at <https://myaccount.google.com/permissions>.

The setup is done **once** (about 10–15 minutes). You need: the Google account you use for Calendar, and your Vercel account.

---

## Part 0 — Database (once)

Supabase → **SQL Editor** → **New query** → paste the whole file `supabase/migrations/20261021000000_google_connections.sql` → **Run**. It creates the small private table that keeps the (encrypted) link. It is safe to run again. (Skip this if Claude already applied it for you.)

---

## Part 1 — Google Cloud (free)

1. Open <https://console.cloud.google.com/> and sign in with your Google account. Accept the terms if asked. (No payment is needed.)
2. Top bar → project picker → **New project** → name it `Nurullah POS` → **Create**. Make sure this project is selected.
3. **Turn on the Calendar API**: menu ☰ → **APIs & Services → Library** → search **Google Calendar API** → open it → **Enable**.
4. **Consent screen**: menu ☰ → **APIs & Services → OAuth consent screen** (newer console: **Google Auth Platform**).
   - Press **Get started** / **Configure**. App name: `Nurullah POS`. User support email: your Gmail. Audience / user type: **External**. Contact email: your Gmail. Agree → **Create**.
   - **Data access** (or **Scopes**) → **Add or remove scopes** → find **Google Calendar API … `.../auth/calendar.readonly`** ("See and download any calendar you can access using your Google Calendar"). Tick it → **Update** → **Save**. (`openid` and `email` are added by default.)
5. **Publish the app** (important): **Audience** (or **OAuth consent screen**) → **Publish app** → **Confirm**. The status must say **In production**.
   - If you leave it in **Testing**, Google cuts the link every **7 days** and you have to reconnect each week.
   - "In production" without Google's verification is fine for personal use. The first time, Google shows **"Google hasn't verified this app"**: click **Advanced → Go to Nurullah POS (unsafe)**. It is your own app, so this is expected.
6. **Create the keys**: **APIs & Services → Credentials** (newer: **Clients**) → **Create credentials → OAuth client ID**.
   - Application type: **Web application**. Name: `Nurullah POS web`.
   - **Authorised redirect URIs → Add URI**: `https://pos.nurullah.com.bd/settings/google`
     (exactly this, no trailing slash. For testing on your own computer you may also add `http://localhost:3000/settings/google`.)
   - **Create**. Copy the **Client ID** and the **Client secret** (keep them private).

## Part 2 — Vercel

1. Make the **encryption key**: any long random text of 32+ characters. For example, in a terminal: `openssl rand -base64 32`. (No terminal? Type a long random sentence of 40+ characters, or use a password manager's generator.) It protects the Google token inside your database. **Keep a copy**: if you change or lose it, you only have to press Connect again.
2. Vercel → your project → **Settings → Environment Variables**. Add these three for **Production** and mark each **Sensitive**:

   | Key | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | the Client ID from Part 1 |
   | `GOOGLE_CLIENT_SECRET` | the Client secret from Part 1 |
   | `GOOGLE_TOKEN_KEY` | the random key from step 1 |

3. **Deployments** → the latest one → **⋯ → Redeploy** (new values only apply after a redeploy).

## Part 3 — Connect (30 seconds)

1. Open the app → **Settings → Integrations**. It shows **Google Calendar** with a **Connect Google Calendar** button. (If it says "Not set up on the server yet", a value in Part 2 is missing or the redeploy is not finished.)
2. Press **Connect**, choose your Google account, press **Continue** on the "not verified" screen (**Advanced → Go to …**), tick the calendar permission and press **Continue/Allow**.
3. You come back to Settings and see **Connected as you@gmail.com**. Open **Calendar**: your Google events are there.

## If something looks wrong

| You see | Why / what to do |
|---|---|
| "Not set up on the server yet" | One of the three Vercel values is missing, or you did not redeploy. |
| Google page: **Error 400: redirect_uri_mismatch** | The redirect address in Google Cloud is not exactly `https://pos.nurullah.com.bd/settings/google`. Fix it (Credentials → your client), wait a minute, try again. |
| Google page: **Access blocked: app has not completed verification** | The app is in *Testing* and your account is not a test user. Publish the app (Part 1, step 5), or add yourself under **Audience → Test users**. |
| "Google did not give a long-lasting link" | Remove the app at <https://myaccount.google.com/permissions>, then press Connect again. |
| "Calendar access was not allowed" | On Google's page you did not tick the calendar permission. Connect again and tick it. |
| Red note in Calendar: "needs to be connected again" | Google stopped accepting the link (you removed access, changed the password, or the app was in Testing for 7 days). Settings → Integrations → **Connect again**. |
| Yellow note: "could not be reached just now" | Google was slow or down. Your own events are still shown; it comes back by itself. |
| A new Google event does not show at once | The app asks Google at most every 2 minutes. Reload the Calendar page after that. |
| An event from a calendar is missing | Only calendars that are ticked/visible in the left side of Google Calendar are shown, and events you **declined** or that were **cancelled** are skipped. |
| Too many Google events | Calendar page → the **Google** switch hides them on this device. |

## Notes

- Times are shown in the time zone of your profile (Settings → Profile).
- A repeating Google event shows on every day it happens. An all-day event that lasts several days shows on each day.
- The Google link is stored encrypted in the table `google_connections`; it is **not** included in **Settings → Data & privacy → Export**, and **Delete all my data** removes it.
- Google events are not shown on the Dashboard or in the morning plan (only in the Calendar page).
