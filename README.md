# 🏏 Cricket Scoreboard — Full-Stack App

A complete ball-by-ball cricket scoring system: team/player management, live scoring engine, real-time
scoreboard broadcasting, and auto-generated batting/bowling scorecards. Everything is derived from an
immutable ball-by-ball log, so undo and scorecards are always consistent.

## Latest update (v4)

- **Records page simplified**: it's now purely the All-Time Records leaderboard page (Match History —
  the list of completed matches — was moved to live under the Matches page / each match's own detail
  screen instead, alongside new **Download PDF** and **Delete** buttons on that detail screen).
- **"Own team" vs opponents**: teams now have an `is_own` flag. Mark your team(s) with the ⭐ toggle on
  the Teams page — Player Stats only ever shows players from teams marked this way, so opponents never
  show up there. The seed script creates a starter **GCC** team already marked as yours.
- **Overs presets**: New Scoreboard's overs field is now a dropdown of common values (5/6/8/10/15/20/
  25/30/40/50) with a "Custom…" option for anything else, defaulting to 20.
- **Spot registration for players**: no pre-registration required. While picking a striker, non-striker,
  bowler, or fielder mid-match, typing a name that doesn't exist yet shows a **"+ Add new player"**
  option — creates them against the right team and selects them immediately, no trip to Manage Teams
  needed. Teams already had the same on-the-spot creation from the New Scoreboard page.
- **Wide/Bye/No Ball/Leg Bye now ask for the run count**: tapping one opens a quick 0/1/2/3/4/6 picker
  (Wide = extra runs beyond the standard 1; No Ball = runs off the bat; Bye/Leg Bye = runs run) instead
  of always assuming 1 run.

## Latest update (v3)

- **All-Time Records page**: Records now has two tabs — Match History (as before, now with a delete
  button per match) and a new **All-Time Records** tab with leaderboards computed across every ball
  ever bowled: highest individual score, best bowling figures, most runs, most wickets, most fours,
  most sixes, best strike rate (min. 10 balls faced), best economy (min. 2 overs), most balls faced,
  and most balls bowled. Backed by `GET /api/records`.
- **Delete completed matches**: a 🗑 button on each match in Match History permanently removes it
  (with a confirmation prompt).
- **Add/remove players from the Player Stats page**: no need to go to Manage Teams — add a player or
  remove one right from Player Stats. Removing a player who has never played is a hard delete; removing
  one with match history **soft-removes** them instead (an `active` flag) so every past scorecard and
  career record they're part of stays intact — they just stop showing up as selectable in new matches.
- **Password-gated New Scoreboard**: creating a new scoreboard now asks for a password first (default
  `gcc` — change `SCOREBOARD_PASSWORD` in `frontend/src/components/ScoreboardGate.jsx` to set your own).
  Once unlocked on a device it stays unlocked there. This is a casual gate to stop accidental/unwanted
  match creation, not real authentication — don't rely on it for sensitive data.

## Latest update

- **New Scoreboard flow simplified**: no more team dropdowns — type a team name and pick it from the
  suggestions, or create it on the spot if it doesn't exist yet. Match type and venue fields were
  removed to keep this to just "who's playing" and "how many overs."
- **Extras simplified**: Wide / No Ball / Bye / Leg Bye are now single-tap buttons (matching a classic
  compact scorer layout) instead of a wall of run-count variants.
- **Swap Batsmen button**: manually swap the striker/non-striker at any time without needing a delivery
  to trigger it (`POST /innings/:id/swap-batsmen`).
- **PDF scorecards**: once a match is completed, a "Download PDF" button (on the Records page and the
  live scoreboard) generates a full scorecard — both innings, batting and bowling tables, extras, and
  the result — as a downloadable PDF, built entirely client-side with jsPDF.
- **Faster rendering**: removed `backdrop-filter: blur()` from cards and the navbar (the single biggest
  GPU cost on mid-range phones when many cards are on screen) in favour of solid semi-opaque
  backgrounds that look almost identical but repaint instantly.
- **Refreshed palette**: richer pitch-green/gold/crimson accents, and boundary/wicket effects now use
  pure `transform`/`opacity` CSS keyframes (cheap to animate, no jank) instead of layered blurs.
- Player Stats has always been scoped to players in your own database — there's no external data
  source, so "our players" is the entire and only dataset it can show.

## What's new in this version

- **Redesigned navigation**: Matches · Records · Player Stats · New Scoreboard (Team management tucked
  under a small "Manage Teams" link so the primary nav stays focused), with a mobile hamburger menu.
- **Live score on the home page**: as soon as a match is live, a pulsing live-score card appears at the
  top of the Matches page and updates in real time — no need to open the scorer to see the game.
- **Records page**: a dedicated archive of every completed match with its final result, linking straight
  to the full scorecard.
- **Type-to-search player pickers**: selecting batsmen, bowler, or fielder is now a live-filtered search
  box (`PlayerAutocomplete`) instead of a long dropdown — type a few letters and tap the match.
- **Boundary & wicket effects**: tapping 4 or 6 pops a full-screen animated "FOUR!"/"SIX!" celebration
  instantly (client-side, so there's zero wait on the network round-trip); a wicket briefly flashes the
  scorecard red. All pure CSS animations — no heavy libraries, so it stays smooth even on modest phones.
- **No-lag live updates**: the scorer and viewer pages apply the Socket.io payload directly to state
  instead of re-fetching the whole match over HTTP after every ball — updates land instantly even with
  a long match history.
- **Responsive layout**: nav, cards, and tables adapt from phone width up to desktop (`sm:`/`md:`
  breakpoints throughout), so it works the same whether you host it and open it in Chrome on a phone or
  a laptop.

## Stack

| Layer     | Tech                                                              |
|-----------|--------------------------------------------------------------------|
| Backend   | Node.js, Express, **Turso/libSQL**, Socket.io           |
| Frontend  | React 18, Vite, React Router, Tailwind CSS, Socket.io-client        |
| Storage   | A single SQLite file (`backend/db/cricket.db`) — zero setup, no external DB server required |

No external database service is needed — SQLite is a real, ACID-compliant, file-based relational
database, which makes this trivial to deploy anywhere (a VPS, a Raspberry Pi, a container). If you'd
rather run Postgres/MySQL in production, only `backend/db/database.js` needs to change — the rest of
the app talks to it through plain SQL.

## Project layout

```
cricket-scoreboard/
├── backend/
│   ├── db/
│   │   ├── schema.sql        # full relational schema
│   │   ├── database.js       # connection + auto-migration on boot
│   │   └── seed.js           # optional demo data (2 teams, 22 players)
│   ├── controllers/          # request handlers
│   ├── routes/                # Express routers
│   ├── utils/scoreCalculator.js  # the scoring engine (ball recording, undo, scorecards)
│   └── server.js             # Express + Socket.io entrypoint
├── frontend/
│   └── src/
│       ├── pages/            # Home, TeamManager, CreateMatch, MatchSetup, Scorer, LiveScoreboard
│       ├── components/       # Navbar, WicketModal
│       ├── api/api.js        # typed API client
│       └── socket.js         # Socket.io client
└── docker-compose.yml        # one-command deploy
```

## Quick start (local development)

Requires Node.js 18+.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env
npm run seed       # optional: creates 2 demo teams with 11 players each
npm run dev         # starts API on http://localhost:4000

# 2. Frontend (in a new terminal)
cd frontend
npm install
npm run dev         # starts dev server on http://localhost:5173 (proxies /api to :4000)
```

Open **http://localhost:5173** — create teams (or use the seeded ones), start a new match, run the toss,
select openers, and start scoring. Open the same match's "View" link in a second tab/device to see the
live scoreboard update in real time as you score.

## Deploying to your own server

### Option A — Docker Compose (recommended)

```bash
docker compose up -d --build
```

This builds and runs both services: the API on port `4000` and the frontend (served by nginx, proxying
`/api` and `/socket.io` to the backend) on port `8080`. The SQLite file persists in a named Docker
volume (`cricket-db`), so data survives container restarts/rebuilds.

### Option B — Manual (any VPS / bare metal)

```bash
# Backend
cd backend && npm install --omit=dev
node server.js            # or: pm2 start server.js --name cricket-api

# Frontend — build static assets and serve them (nginx, Caddy, or Express itself)
cd frontend && npm install && npm run build
# server.js already auto-serves frontend/dist if it exists, so you can just
# run the backend alone in production and it will serve the built SPA too.
```

Set `CORS_ORIGIN` in `backend/.env` to your real domain in production instead of `*`.

## Data model

- **teams** — id, name, short_name, color
- **players** — id, team_id, name, role, batting/bowling style, jersey number
- **matches** — id, two teams, match type (T20/ODI/TEST/CUSTOM), overs limit, toss, status, result
- **innings** — one row per innings: batting/bowling team, running totals, extras breakdown, current
  striker/non-striker/bowler, target (2nd innings)
- **balls** — one immutable row **per delivery**: batsman, bowler, runs, extra type, wicket details.
  This is the single source of truth — batting cards, bowling cards, overs, and run-rate are all
  computed live from this table, and **undo** works by deleting the last row and replaying the rest,
  so it can never drift out of sync.

## Scoring engine rules implemented

- Runs 0–6, wides, no-balls, byes, leg-byes, penalty runs
- All standard dismissal types (bowled, caught, lbw, run-out, stumped, hit-wicket, retired)
- Automatic strike rotation on odd runs and at the end of each over
- Enforces: same bowler can't bowl consecutive overs (override with `force: true` if needed)
- Auto-detects innings end: all out, overs completed, or (2nd innings) target reached
- Auto-computes match result (won by runs / wickets / tied) once both innings finish
- Real-time broadcast via Socket.io to every client viewing that match (`match-{id}` room)
- **"Our Players" career records** — a dedicated page lists every player across every team; clicking a
  name pulls their all-time stats aggregated across every match ever scored: innings batted, runs,
  balls faced, fours, sixes, strike rate, average (batting) and innings bowled, overs, balls bowled,
  runs given, wickets, economy, fours given, sixes given (bowling). Backed by `GET /players/:id/stats`.

**Not modeled** (kept out of scope to stay a clean, correct base you can extend): free-hit
restrictions after a no-ball, DRS/review workflow, powerplay/fielding-restriction tracking, and
multi-day Test match session/day boundaries. The schema and ball log are detailed enough that all of
these can be layered on without breaking anything already there.

## REST API reference

Base URL: `/api`

| Method | Endpoint                              | Purpose                                 |
|--------|----------------------------------------|------------------------------------------|
| GET    | `/teams`                               | List teams                                |
| POST   | `/teams`                               | Create team `{name, short_name, logo_color}` |
| GET    | `/teams/:id`                           | Team detail + players                     |
| PUT    | `/teams/:id`                           | Update team                               |
| DELETE | `/teams/:id`                           | Delete team                               |
| GET    | `/players?team_id=`                    | List players (optionally by team)         |
| GET    | `/players/all/with-teams`              | Every player across all teams, with team name attached |
| GET    | `/players/:id/stats`                   | Career batting + bowling stats for one player |
| POST   | `/players`                             | Create player                             |
| PUT    | `/players/:id`                         | Update player                             |
| DELETE | `/players/:id`                         | Delete player                             |
| GET    | `/matches`                             | List matches                              |
| POST   | `/matches`                             | Create match `{team1_id, team2_id, match_type, overs_limit, venue}` |
| GET    | `/matches/:id`                         | Full match detail (both innings + scorecards) |
| POST   | `/matches/:id/toss`                    | Record toss, creates innings #1           |
| POST   | `/matches/:id/second-innings`          | Start innings #2 after the break          |
| DELETE | `/matches/:id`                         | Delete match                              |
| GET    | `/innings/:id/scoreboard`              | Live scoreboard for one innings           |
| POST   | `/innings/:id/set-batsmen`             | `{striker_id, non_striker_id}`            |
| POST   | `/innings/:id/set-bowler`              | `{bowler_id, force?}`                     |
| POST   | `/innings/:id/ball`                    | Record one delivery (see below)           |
| POST   | `/innings/:id/undo`                    | Remove the last delivery                  |
| GET    | `/records`                             | All-time batting/bowling leaderboards     |

### Recording a ball — `POST /innings/:id/ball`

```jsonc
// Normal delivery
{ "runs": 4 }

// Wide (extra_runs = total run value of the wide, min 1)
{ "extra_type": "wide", "extra_runs": 1 }

// No-ball with 2 run off the bat
{ "extra_type": "noball", "extra_runs": 1, "runs": 2 }

// Leg-bye of 2
{ "extra_type": "legbye", "extra_runs": 2 }

// Wicket (caught)
{ "is_wicket": true, "wicket_type": "caught", "dismissed_id": "<striker-or-non-striker-id>", "fielder_id": "<fielder-id>" }
```

The server always scores against whichever striker/non-striker/bowler are currently set on the
innings — the client never needs to resend player IDs per ball.

## License

MIT — do whatever you like with it.


## Turso + Render + Netlify deployment

### Render backend
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CORS_ORIGIN`

The backend automatically creates the tables from `backend/db/schema.sql` when it starts.

### Netlify frontend
- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables:
  - `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`
  - `VITE_SOCKET_URL=https://YOUR-RENDER-SERVICE.onrender.com`

Replace the example values with your real Render and Netlify URLs. Keep `TURSO_AUTH_TOKEN` only on Render; never put it in frontend code or GitHub.
