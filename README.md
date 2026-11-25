# Fishers & Forts

An Ice Fishing logic puzzle in a drawer, plus a Snow Fort in the world that everyone builds together. Every fish caught adds snow; as World Snow grows, bricks appear on the fort one at a time. Launching with Winter Wonderland (Dec 1, 2026).

See [`plan.md`](plan.md) for the design decisions, data models and build status.

## What players see

- **Fishing drawer** (Fishing Shack): today's **Daily Lake** (same lake for everyone, one try, one special fish), then the **Daily Fishing Tournament** (up to 10 random lakes a day). A 7×7 lake hides 7 fish; you have 18 drills. A drilled hole shows how many of its 8 neighbors hold a fish. The Helper marks holes that a single number proves are empty.
- **Snow Fort drawer** (Fort Sign): the fort as built so far, progress to the goal, your contribution, builders, and the four sections.
- **Trophy drawer**: Tournament, Daily Lake (Today / Yesterday) and Fort Builders leaderboards; Badges.
- **Toasts**: special catch, brick added, yesterday's tournament finish, milestones and fort complete (world-wide), badges.

## What admins see

The gear in the Fishing drawer opens **Admin Settings**: fort goal (1,000 / 10,000 / 30,000 / 50,000 / 100,000), tournament lakes per day (5 / 10 / 20 / no limit), **Start a new fort**, and a warning listing any fort blocks missing from the world. Admins can also reset the Fort Builders leaderboard from the Trophy drawer.

## Required assets (unique names)

Place one scene per instance. A world can hold several (e.g. one per theme), and each runs independently:

| Asset | Unique name | Click behavior |
|---|---|---|
| Fishing Shack (key asset) | `Fishers&Forts_keyAsset` | Iframe drawer → `{appUrl}/` |
| Fort Sign | `Fishers&Forts_fort` | Iframe drawer → `{appUrl}/fort` |
| Trophy | none needed | Iframe drawer → `{appUrl}/trophy` |
| Fort blocks 1–50 | `Fishers&Forts_fortBlock_1` … `Fishers&Forts_fortBlock_50` | Not clickable. Web-image asset, transparent to start. Slots 33–34 are the tower tops; slot 50 is the flag block |

Slot order (Castle): foundation 1–8 (bottom row, left → right), walls 9–20, towers 21–34 (33/34 = tower tops), keep 35–50 (50 = the flag block). A missing or deleted block never breaks the game; it's listed in Admin Settings and restored automatically once an asset with that unique name is back.

Piece art is served from the `sdk-fishers-and-forts` S3 bucket (same for every ecosystem): `https://sdk-fishers-and-forts.s3.amazonaws.com/{theme}/` with `brick.png`, `tower-top.png`, `flag.png`, `transparent.png`. Override the base URL with `FORT_ART_BASE_URL`.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/game-state?kind=daily\|tournament&open=` | Fishing drawer |
| POST | `/api/lake/drill` `{ kind, hole }` | Drill a hole (server-authoritative) |
| GET | `/api/fort?open=` | Snow Fort drawer |
| GET | `/api/trophy?open=&forceRefreshInventory=` | Leaderboards + badges |
| POST | `/api/leaderboard-view` `{ board }` | Leaderboard view analytics |
| GET/POST | `/api/admin/settings` | Admin settings (+ missing block report) |
| POST | `/api/admin/start-new-fort` | Reset the fort |
| POST | `/api/admin/reset-leaderboard` | Reset Fort Builders |

## Data objects

- **Key asset** (`Fishers&Forts_keyAsset`, one per scene): `fort`, `settings`, `dayKey`, `leaderboards` (pipe-delimited), `tournamentHistory`, `fortBuildersEpoch`. Every drawer finds its scene's key asset by `sceneDropId`, so two scenes in one world (e.g. two themes) run independently. Nothing is stored in the World data object. Removing a scene removes its data, and re-dropping it starts a fresh fort.
- **Visitor/User**: `lifetime` totals and a `badges` cache at the top level; per-scene state under `${urlSlug}-${sceneDropId}` (daily progress, tournament progress, snow added).

The app must be placed as a scene: requests without a `sceneDropId` are refused.

Full shapes: [`shared/types/index.ts`](shared/types/index.ts).

## Badges

19 badges (Fishing, Daily Lake, Fishing Tournament, Snow Fort; see `server/utils/badges.ts`). Import them into the ecosystem with names matching exactly; icons come from the ecosystem catalog.

## Development

```bash
cp .env-example .env   # INTERACTIVE_KEY, INTERACTIVE_SECRET, INSTANCE_DOMAIN
npm install
npm run dev            # server :3000, client :3001
cd server && npx jest  # engine, fort and route tests
```
