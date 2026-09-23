# MakersMap

A city-level atlas of makers, founders, designers, and developers. People appear on the map from two sources: they add themselves, or they posted a public introduction on X ("I'm 29. Solo founder from Brazil, based in Barcelona. Looking to connect with…") and the importer listed them from that one post. Every pin is a real person; there is no sample data.

**What it does**

- An interactive world map (MapLibre) with clustering, country and city selection, and a list of everyone in the selected place.
- Full profiles built from the intro post and the X bio: role, city, what they're building, what they're looking for, and the post itself, pinned. Owners claim their pin with Sign in with X and then control every word.
- Projects with a real website only. The site is read and the name, one-line pitch, summary, and logo come from the page itself; links are re-checked weekly.
- Leaderboard by country and city, city pages with "new this week" and "up for coffee", share cards for pins, matches, cities, and countries.
- Ask the atlas: natural-language search over the roster, and AI-written match intros on each profile.
- An admin console for the importer, the review queue, and outreach (replies under intro posts from a connected X account, capped per day).
- Weekly "who looked at your pin" emails with a one-click unsubscribe.

## Stack

React 19 with the Next-style app directory via [vinext](https://github.com/vinext) on Vite, Tailwind, shadcn/ui, MapLibre GL, MongoDB. Deploys to Cloudflare Workers. Post reading, project summaries, search, and intros use a language model through OpenRouter (any model; GPT-4o mini by default) or the Anthropic API.

## Running it

```bash
corepack pnpm install
cp .env.example .env   # fill in the values below
corepack pnpm dev      # http://localhost:5173
```

Environment variables (see `.env.example`):

| Variable | Needed for |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Everything. A local MongoDB works. |
| `TWITTERAPI_IO_KEY` | Importing intro posts (twitterapi.io). `X_BEARER_TOKEN` is the X API fallback. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Reading posts, project summaries, search, intros. Or `ANTHROPIC_API_KEY`. |
| `ADMIN_SECRET` | The admin console at `/admin` and the daily job. |
| `SESSION_SECRET` | Signing the login cookie. |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | Sign in with X (OAuth 2.0 web app; callback `<SITE_URL>/api/auth/x/callback`). |
| `SITE_URL` | The public origin, for OAuth callbacks and links. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Weekly emails (optional). |
| `PLAUSIBLE_DOMAIN` | Cookie-free analytics (optional). |

Without a model key the importer falls back to a rules-based reader. Without X credentials, claiming and joining with X are disabled and the manual join form still works.

## How the data flows

1. **Import** (`lib/x-pipeline.ts`): searches X for intro posts with several query patterns over a window, skips posts already seen, and reads each new one with the model (`lib/x-extract.ts`) to get role, place, interests, what they're looking for, and projects. Places are geocoded (`lib/geocode.ts`). Low-confidence reads go to the review queue instead of the map.
2. **Projects** (`lib/site-reader.ts`): a project needs a link we can visit. Shortened links are expanded, social profiles and stores are rejected, the page is read, and the model writes the name, pitch, and summary from it. Dead links are pruned weekly.
3. **Claim or join** (`lib/join-from-x.ts`): Sign in with X either claims the listed pin or builds a new one from the X profile. People without X use the form and get a private edit key.
4. **Daily job** (`GET /api/cron/daily?key=<ADMIN_SECRET>`): incremental import, deleted-post check, link re-check, outreach replies (if enabled), weekly digests. Call it from any scheduler.

The public API serves three tiers: dots for the map (`/api/makers`), card details for what's on screen (`/api/makers/cards?ids=`), and rows per place (`/api/makers/place?country=`). Claim tokens, edit keys, emails, and review state never leave the server.

## Privacy and removal

Listed pins hold only what the person made public: name, handle, photo, bio, the city they named, and the one intro post. They carry a no-index instruction until claimed. Anyone can remove their pin by signing in with the same X account at `/remove`. See `/privacy` and `/terms` in the app.

## Contributing

Type-check with `corepack pnpm exec tsc --noEmit` and lint with `corepack pnpm lint` before opening a pull request. Keep the data rules: nothing invented, nothing from outside X posts, X profiles, and the projects' own websites.

## License

MIT. See `LICENSE`.

## Secrets and the database

Secrets live only in `.env` (ignored by git) and, in production, in Cloudflare Worker secrets set with `wrangler secret put NAME`. A production build leaves every secret out of the generated Worker config; only non-secret settings (`MONGODB_DB`, `OPENROUTER_MODEL`, `EMAIL_FROM`, `SITE_URL`, `PLAUSIBLE_DOMAIN`) are inlined. `readEnv` in `db/index.ts` reads the Cloudflare binding first and the process environment second.

The repository ships with no data. The database holds people's private fields (emails, edit keys, claim tokens) and is never published. To move a database between environments use MongoDB's own tools:

```bash
mongodump --uri "$SOURCE_URI" --db makersmap --out ./dump
mongorestore --uri "$TARGET_URI" --db makersmap ./dump/makersmap
```

Collections: `makers` (people and projects), `counters` (id allocation), `geocache`, `sitecache`, `intro_cache` (model outputs, safe to drop), `import_state`, `signals`, `settings` (operator tokens, sensitive).
