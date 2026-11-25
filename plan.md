# Fishers & Forts — Implementation Plan

Read `.ai/rules.md` (or the canonical `../sdk-ai-boilerplate/.ai/rules.md`) before writing code, and check `.ai/examples/` for the pattern before building anything new.

**Source material:** Design Spec 0.2 (Shelby Moledina, updated 11/18/26) plus the mockup set (`ww-icefish-ui-*`). Tickets: EXP-417 (Ice Fishing Sonar) and EXP-426 (Snow Fort). Spec section numbers are cited as **§n** throughout. When this plan and the spec disagree, check the **Decisions** section first. If it doesn't settle the question, the spec wins and this plan gets updated.

**Target launch:** Winter Wonderland, **Dec 1, 2026**.

---

## 1. Project Overview

Fishers & Forts is one SDK app with two halves that feed each other:

- **Ice Fishing** is a short logic puzzle in a drawer. It works like Minesweeper turned around: you drill holes in a 7×7 frozen lake to find 7 hidden fish. A hole with no fish shows how many of its 8 neighbors hold a fish. Drills are limited (18). There is no timer.
- **The Snow Fort** is a fort in the world that everyone builds together. Every fish caught adds snow to the world's total, and as the total grows, snow bricks appear on the fort one at a time.

The halves are one app because one app's key can't write another app's data today (§1, §15).

**Release scope**

| Scope | Contents |
|---|---|
| **v1** | Daily Lake, Daily Fishing Tournament, Snow Fort (in the world + its drawer), milestones, toasts, Trophy drawer (Leaderboards + Badges), Admin Settings |
| **v1 stretch** | Special Catches collection (§5.6) and its 2 badges |
| **v2** | Fort varieties (§6.5), difficulty levels (bigger lakes), other apps feeding the fort (§15) |

## 2. Core User Flow

1. Player clicks the **Fishing Shack** (key asset). The Fishing drawer opens on today's **Daily Lake**. If it's already finished, the drawer shows the finished lake and its result.
2. Player drills holes. Each drill shows a fish or a number. The **Helper** auto-marks holes that a single number proves are empty.
3. The lake ends when drills run out or all 7 fish are caught. A **result card** itemizes the snow earned. Snow goes to **World Snow** and to the player's own contribution.
4. When World Snow crosses a brick threshold, the next **brick appears** on the fort in the world, in slot order. A section's last brick is a **milestone**: a world toast goes out, and contributors get a badge.
5. After the Daily Lake, the **Tournament** unlocks: up to 10 random lakes per day (admin-configurable). Fish caught count toward today's tournament score.
6. At **12:00 am ET**: a new Daily Lake, the tournament closes (top 3 saved, badges awarded), and the next open shows a toast with the player's finish.
7. When slot 50 appears, the flag goes up and the fort is **complete**. An admin can start a new fort.

Other entry points: the **Fort Sign** opens the Snow Fort drawer and the **Trophy** opens Leaderboards/Badges. The **gear** (admins only, Fishing drawer) opens Admin Settings. There is no How to Play screen in the app (decided 11/20), so drawer headers have only the title, the gear (admins) and ×.

## 3. Important Terminology

- **Lake**: a 7×7 puzzle with 7 fish, 18 drills and 3 starter clues.
- **Starter clue**: one of 3 pre-drilled, non-adjacent holes with a non-zero number, shown with a yellow ring.
- **Helper**: after every drill, for every number on the board, if (caught fish around it) == number, mark all its undrilled neighbors empty. Marked holes can't be drilled and cost nothing. The Helper never uses two numbers together and never reveals fish (§4.3).
- **Solver**: a deterministic "careful player" used at generation time. A lake is kept only if the solver catches ≥5 of 7 fish (§4, steps A–F).
- **Daily Lake**: generated from the ET date as seed. Same lake for everyone, one attempt per day, with one **special fish** (5 snow).
- **Tournament lake**: a random lake. All fish are regular. It counts toward the day it is **finished**, not the day it was started.
- **ET day key**: `YYYY-MM-DD` in `America/New_York`. Reuse `etDayKey()` from `sdk-birdwatch/server/utils/mysteryBird/pickTodayPuzzle.ts`.
- **World Snow**: the world's running snow total for the current fort. It is never spent or lost, only reset when an admin starts a new fort.
- **Slot**: a brick's position in the build order (1–50). Foundation is 1–8, Walls 9–20, Towers 21–34 (33 and 34 are tower tops), Keep 35–50. Slot 50 is the **flag block** (the last keep block with the flag on top).
- **Brick threshold**: brick *n* appears when `worldSnow >= goal * n / 50` (600 snow per brick at the default 30,000).

## 4. Decisions

### 4.1 Snow Fort bricks: pre-placed assets + image swap (decided)

**Question:** should the 50 bricks already exist in the scene, with the app swapping each one's image when it's earned, or should the app drop new assets as bricks are earned?

**Decision: pre-place all 50 pieces in the scene with a transparent image, and swap to the snow art with `droppedAsset.updateWebImageLayers()` when earned.** Lina builds the scene by hand.

| | Pre-placed + image swap | Drop on earn |
|---|---|---|
| Write cost per brick | 1 light update (image layer) | 1 asset creation (`DroppedAsset.drop`), which is heavier server-side |
| Concurrency (two lake finishes cross the same threshold at once) | **Idempotent.** Setting the same image twice is harmless | Can create **duplicate bricks** unless every drop is lock-guarded and deduped by unique name |
| Recovery from a failed call | Just re-apply; no state to reconcile | Must find orphans or missing drops by unique name |
| Rendering cost before bricks appear | 50 sprites sharing one cached ~70-byte transparent PNG. Negligible for Pixi | 0 sprites early, 50 by the end. Same end state |
| Laying out the fort | Built visually in the world editor, positions exact, shipped as part of the scene | Positions computed in code from a layout file (offsets from an anchor) |
| Scene removed / re-dropped | Bricks come back with the scene; app re-applies images for placed slots | Dropped bricks may be left behind or lost; app must clean up and re-drop |
| "Start a new fort" | 50 image updates back to transparent | 50 deletes (`WorldFactory.deleteDroppedAssets` can batch) |
| Other players see it | Live (asset updates are pushed to everyone in the world) | Live |

The SDK has no bulk image-update or bulk drop, so both options cost one API call per brick. Pre-placed wins on safety under concurrent writes (the real risk at Winter Wonderland traffic), on cheaper writes, and on easier scene authoring. Answers to the spec's open questions in §6.2:
- **Can a scene comfortably hold 50 extra assets?** Yes.
- **Do other players see new bricks live?** Yes, without a reload. Verify on dev during Phase 3.

**Piece art.** Piece images (brick, tower top, flag, transparent) are served from the `sdk-fishers-and-forts` S3 bucket (`{theme}/*.png`, same for every ecosystem) and listed in `shared/fort/themes.ts`. Placeholders ship until final art lands; swapping art is a file replace, no world edits.

**How it scales to future themes and layouts (§6.5, §11 re-theming):**

- **Re-theming** (e.g. tropical: sandcastle): the app picks which image URL to apply. Piece art lives in a `theme` config (`{ brick, towerTop, flag, transparent }` URLs), so a new theme is a config entry with no world edits.
- **Fort varieties** (Castle / Snow Lodge / Pyramid / Snowman): every variety uses the same 50 pieces with the same slot and type assignment (tower tops are always 33/34, slot 50 always last). Only positions change. We keep one layout file per variety (`shared/fort/layouts/castle.ts`, …) holding each slot's offset from the Fort Sign. In v2, when an admin starts a new fort with a different variety, the app calls `updatePosition()` on the 50 pieces once (a rare admin action). The same layout file draws the fort picture in the Snow Fort drawer, so the world and the drawer always match.
- Alternative for v2 if repositioning feels fragile: one scene per variety, and the admin swaps scenes.

**Considered and not recommended:** a single fort asset with 51 pre-rendered stage images. It renders cheapest (1 sprite), but needs 51 composite images per variety and theme, every player downloads a new large image on each brick, and admins can't adjust the layout.

**Clicking a brick (§3 open question): decided, bricks are not clickable.** The fort asset (`Fishers&Forts_fort`) is the entry point.

**Missing or duplicate pieces (someone deletes or copies a block by accident).** The app never caches piece IDs and never trusts a "last rendered" counter. Instead, every render is a **reconcile pass**:

1. One `world.fetchDroppedAssetsWithUniqueName({ uniqueName: "Fishers&Forts_fortBlock_", isPartial: true })` returns every block in the world. Parse the slot number from the suffix (`Fishers&Forts_fortBlock_7` and `…_07` both mean slot 7; anything unparseable or outside 1–50 is ignored).
2. For each piece, the desired image is the piece art if `slot <= bricksPlaced`, else transparent. Only pieces whose current layer URL differs get an `updateWebImageLayers()` call, so a pass with nothing to fix costs one read.
3. Slots 1–50 with no matching asset are reported back to the caller (not stored). Nothing errors: the brick count, snow math, milestones and drawer picture are driven by `bricksPlaced`, not by what exists in the world. Duplicates of the same slot are both updated (harmless).
4. Admin Settings shows a warning when any slot is missing ("Missing fort blocks: 12, 27. Re-add an asset with unique name `Fishers&Forts_fortBlock_12`."). Once re-added, the next pass restores its image automatically.

The pass runs after a lake finish that placed a brick, when an admin opens Admin Settings or changes the goal, and on Start a new fort. That makes recovery self-healing with no separate repair tool.

### 4.2 Data scoping

- **Fort and scene state** lives in the data object of the scene's **key asset** (`Fishers&Forts_keyAsset`), at top level (no app namespace: the public key already scopes it). Every drawer finds its scene's key asset with `world.fetchDroppedAssetsBySceneDropId`. Decided 11/25, replacing the World data object: two scenes in one world (e.g. two themes) must act independently, and per-scene state in the World data object would grow with every drop and re-drop and be fetched by every request. Trade-off accepted: removing a scene removes its data, and re-dropping it starts a fresh fort.
- **Player state** lives in the Visitor/User record (same backing record). Lifetime totals are top-level keys; per-scene state sits under `${urlSlug}-${sceneDropId}`.
- **Milestone badges are awarded lazily from the player's own record**, not from a world-level list of every contributor's profileId (§Appendix). On app open: if the player's scene entry has `snowAdded > 0` and the scene's fort has reached milestone X and the player lacks badge X, grant it. This meets §6.3 ("earn it the next time they open the app") without a data object that grows to 15k+ profileIds and gets fetched on every open. "Builders: n players have helped" becomes a counter, incremented when a player's snow for the current fort goes from 0 to >0.
- **Tournament badges and the "you finished #4 yesterday" toast are also lazy.** At rollover, save each closed day's final top 10 profileIds in a small bounded `tournamentHistory` (keep 14 days). On open, each player checks the days since they last checked and grants their own Top Ten, Podium or Champion badges.

### 4.3 Server-authoritative drilling (decided)

Fish positions never reach the client until a lake ends. Each tap calls `POST /api/lake/drill`. The server regenerates the lake from its seed (cheap and deterministic), validates the drill, runs the Helper, saves progress, and returns only the revealed info. This blocks devtools cheating on competitive leaderboards and gives mid-lake resume (§5.2.5) for free.

The cost is roughly 18 visitor writes per lake and network latency on each tap. The client hides latency by playing the press animation immediately.

Rejected alternative: client-side play with server replay on finish (fish positions visible in devtools).

**Scope (decided):** "one Daily Lake attempt" and the tournament lake cap are **per scene**. A player in two scenes plays each scene's Daily once and contributes snow in each; lifetime totals (badges) still follow the player.

### 4.4 Write contention on the scene data object

Every lake finish touches World Snow, the leaderboards and possibly `bricksPlaced`. Per our "one write per data object per controller" rule, a lake finish does **one** locked `keyAsset.updateDataObject()`: fetch, compute the new snow, leaderboard entries and brick count, write, release. Brick image swaps happen **after** the write, outside the lock, as the idempotent reconcile pass from §4.1, so a failed swap is fixed by the next pass. The lock is keyed per scene, with short TTL and retry/backoff. Load-test this before launch (Phase 7).

## 5. Technical Requirements

### 5.1 Styling (§11)

Follow `.ai/style-guide.md` for the cascade-layer setup (`tailwind` → `sdk` → unlayered app CSS, preflight off). The spec calls for the **Trivia visual family with the Frost palette**. Start from `../sdk-trivia/client/src/styles/{tokens,components}.css` and swap in the Frost tokens. The design is custom: SDK classes are used where they fit (buttons, modals, typography resets), and the chunky outlined look lives in `client/src/styles/*.css`.

- **Fonts:** Trivia uses **Bricolage Grotesque** (800: titles, buttons, lake numbers, names), **Space Mono** (700, caps, 0.12em tracking, 10–11px: labels, counters, banner) and **Outfit** for body text. The spec says to use Trivia's fonts where they differ, so body text is **Outfit**, not Inter.
- **Frost tokens:** drawer bg `#EEF4F7` · cards/drilled holes `#FBFDFE` · ink/outline/shadow `#10202E` · accent `#2F6FED` · banner/clue ring/special/top-3 `#FFD447` · ice `#BFE3F7` · grid lines/pressed `#93CBE9` · Helper-marked `#E0F1FB` + dot · fish `#FF7A45` · secondary text `#566877` · danger (Start new fort) red per mockup.
- **Shapes:** 2.5px outlines; unblurred drop shadows straight down (6px drawer, 5px cards/lake, 4px buttons); corners 14px cards, 12px buttons, pill tabs. Dot texture in the top-right of the drawer.
- **Lake:** one connected sheet with 2px lines, not separate raised buttons. Each hole is still a real `<button>` for a11y. ~44px holes in the 350px drawer.
- **Animations:** per §11 (fade-in stagger, number flip, fish pop, Helper marks, counter bump, result card rise, fort bar fill, leaderboard row stagger, badge pop). **All gated on `prefers-reduced-motion`.**
- **A11y:** every hole has an `aria-label` ("Row 3, column 5, undrilled" / "3 fish nearby" / "fish caught" / "marked empty"). Numbers never rely on color alone. Result card, toasts and counter changes are announced via `role="status"`. Full keyboard play (arrow-key grid navigation is a nice-to-have).
- **Admin gear (decided 11/20):** matches the mockup. `PageContainer` renders the drawer header (title, gear, ×) and `AdminView` renders Admin Settings. `AdminIconButton.tsx` itself is unchanged and is placed in the header (it shows its standard back arrow while settings are open).
- **Cascade note:** the base `p`/`h*` resets use `:where(.rtsdk)` (zero specificity, unlayered) so they beat the SDK layer's fonts but never a component class. Because unlayered beats the Tailwind layer, don't put Tailwind margin utilities on `<p>`; use an `ff-` class.

### 5.2 Required assets (unique names)

All placed as one scene, built by hand by Lina. A world can hold several instances, one scene each.

| Asset | Unique name | Click behavior |
|---|---|---|
| Fishing Shack (key asset) | `Fishers&Forts_keyAsset` | Iframe drawer → app `/` (Fishing) |
| Fort Sign | `Fishers&Forts_fort` | Iframe drawer → app `/fort` |
| Trophy | none needed | Iframe drawer → app `/trophy` |
| Fort blocks 1–50 | `Fishers&Forts_fortBlock_1` … `Fishers&Forts_fortBlock_50` | Not clickable. Starts transparent. Slots 33–34 are tower tops, the rest are bricks (type derived from slot in code) |

**Which drawer to show (decided 11/20, standard for all SDK apps):** path routes in `App.tsx`, not search params or unique names: `/` → Fishing (key asset), `/fort` → Snow Fort, `/trophy` → Trophy. Drawer-to-drawer switches (§3.5) navigate between these paths and carry the query string so the session params survive.

### 5.3 Data Models (`shared/types/index.ts`)

The source of truth is [`shared/types/index.ts`](shared/types/index.ts). Summary:

- **Scene data object** (on the key asset; top-level keys, no app namespace): `fort` (fortNumber, variety, theme, worldSnow, bricksPlaced, a `spacing` anchor for goal re-spacing, milestones, builderCount, startedAt, completedAt), `settings` (fortGoal, tournamentLakesPerDay), `dayKey` (last rolled-over ET day), `leaderboards` (tournament / dailyLake / fortBuilders pipe-delimited maps + `yesterday` frozen maps), `tournamentHistory` (dayKey → top-10 profileIds, 14 days), `fortBuildersEpoch` (bumped by the admin reset).
- **Visitor/User record:** top-level `lifetime` totals (fish, lakes, perfect lakes, daily lakes, special fish, tournament lakes) and `badges` (name → awardedAt; a cache so most opens skip the inventory fetch). Per-scene state under `${urlSlug}-${sceneDropId}`: snowAdded/snowAddedAt, fortNumber + snowThisFort, buildersEpoch + buildersSnow, `daily` progress, `tournament` (dayKey, lakesFinished, fish, reachedAt, started, inProgress, lastFinished), lastSeenDay, lastOpenAt.
- **LakeProgress** (server-only): kind, seed, dayKey, drilled, caught, marked, drillsLeft, finished, timestamps, result. Lakes are regenerated from the seed, never stored. Seeds are HMAC'd with the app secret so lakes can't be computed from the public source.
- **Client views:** `LakeView` (49 `HoleView`s; fish only after the lake ends), `FishingState`, `DrillResponse`, `FortView`, `TrophyState`, `AdminState`.

Example scene data object:

```json
{
  "fort": { "fortNumber": 1, "variety": "castle", "theme": "winter", "worldSnow": 18720, "bricksPlaced": 31,
            "spacing": { "fromSnow": 0, "fromBricks": 0 }, "milestones": { "foundation": 1764621000000, "walls": 1764800000000 },
            "builderCount": 1870, "startedAt": 1764590400000, "completedAt": null },
  "settings": { "fortGoal": 30000, "tournamentLakesPerDay": 10 },
  "dayKey": "2026-12-04",
  "leaderboards": { "tournament": { "pid_1": "SnowyFox482|58|1764870000000" }, "dailyLake": {}, "fortBuilders": {}, "yesterday": null },
  "tournamentHistory": { "2026-12-03": ["pid_1", "pid_9"] },
  "fortBuildersEpoch": 0
}
```

## 6. User Stories & Acceptance Criteria

### Epic 1: The puzzle engine (§4)

**1.1 Generate lakes**: as a player, I always get a fair, solvable-feeling lake.
- 7×7, 7 fish, 18 drills, 3 non-adjacent (incl. diagonal) non-zero starter clues. Retry from step 1 if 3 clues can't be found.
- Solver per §4 steps A–F with reading-order tie-breaks. Keep the lake if the solver catches ≥5.
- Daily: seeded PRNG from `daily-${dayKey}` + try number, so it's identical everywhere. Special fish = a seeded pick from the 7.
- Tournament: random seed per lake, not numbered or kept after finishing.
- Pure TypeScript in `shared/lake/` with no SDK deps, so it can be unit-tested in isolation.

**1.2 The Helper**: after every drill, every number with caught-neighbors == n marks its undrilled neighbors empty. Nothing is marked at lake open. It never reveals fish and never combines two numbers.

**1.3 Lake end**: ends at 0 drills or 7/7 fish. Marked holes don't affect the end. Partial results are kept.

### Epic 2: Fishing drawer (§5)

**2.1 Layout**: the header shows the title, × and the gear for admins. Under it: Daily/Tournament pill (Daily selected on open), banner, DRILLS/FISH counters, lake, the one-line reminder, result card (when over), tournament strip, Snow Fort strip, and [See the Snow Fort] (always shown).
- Tournament is greyed with a lock until today's Daily is finished. Tapping it shows "Finish today's Daily Lake first."
- Yesterday's results are not shown here.

**2.2 Playing**: every tap on an undrilled hole drills it. Marked holes ignore taps. Closing mid-lake saves and resumes (daily and tournament).

**2.3 Daily Lake**: one attempt, resets at 12:00 am ET. When finished, it shows the finished lake, result card, the player's rank on today's Daily board, and "Next lake at 12:00 am ET". The special fish looks normal until caught (yellow when caught).

**2.4 Tournament**: selecting it resumes the in-progress lake or starts the next one (it does **not** start a new one on every click). A lake counts toward the day it is finished. Score = today's tournament fish. Strip line 1: "FISHING TOURNAMENT" + "Rank #r" (or "Not entered yet"), with a rank-delta arrow after a lake. Line 2: "n fish · k of 10 lakes left" + "Ends 12:00 am ET". When all lakes are used, [Play a tournament lake] is greyed with the "You've fished all 10…" message. "No limit" hides the count.

**2.5 Result card**: "You caught n of 7 fish" ("Perfect lake!" prefix at 7/7). Missed fish are outlined on the lake. Itemized snow: Fish +1 each, Special +5, Perfect bonus +3. "Snow for the fort +n", "m snow until the next brick." [Play a tournament lake] button. The fort strip animates to the new total.

**2.6 Toasts** (§5.7): special catch (player); yesterday's tournament finish on first open of the day (player); "You added a brick to the Snow Fort!" (player, when their snow placed ≥1 brick); milestone and fort complete (`world.fireToast`, everyone); standard badge toasts.

### Epic 3: Snow Fort (§6)

**3.1 Earning snow**: snow goes to `fort.worldSnow` and the player's `snowAdded` / `snowThisFort`, in one locked world write per lake finish (§4.4).

**3.2 Bricks in the world**: after the write, if `bricksPlaced` increased, run the reconcile pass (§4.1), then trigger a sparkle particle (`world.triggerParticle`) at each newly placed piece. Missing slots are skipped and reported, never fatal. Slot 50 is the flag block. Changing the goal mid-fort re-spaces the remaining bricks: `bricksPlaced` never decreases, and lowering the goal may place several bricks at once on save.

**3.3 Milestones**: Foundation 8 · Walls 20 · Towers 34 · Keep 50. Record `reachedAt` once per fort, fire the world toast and the milestone analytics event, and award badges lazily (§4.2). At completion: flag, "Fort complete!" in the drawer, and the toast. (Decided: the Fort Sign image does **not** change.) Fishing still counts on the leaderboards.

**3.4 Snow Fort drawer** (§6.4): banner "SNOW FORT • 31 OF 50 BRICKS" / "FORT COMPLETE!". The copy line changes on completion. Fort picture drawn from the variety layout file showing **placed pieces only** (no dashed outlines). "18,720 of 30,000 snow" + bar + "480 snow until the next brick" (or "The flag is up on the Keep!"). "You've added n snow." "Builders: n players have helped." Four section rows show REACHED or "n TO GO". [Go fishing] opens the Fishing drawer.

**3.5 Drawer to drawer**: [See the Snow Fort] / the fort strip and [Go fishing] switch routes in place inside the same drawer (instant, no SDK calls). If a true close/reopen on the target asset is wanted later, the `transitionIframe` pattern in `../sdk-monster-mash/server/utils/iframes/transitionToDrawer.ts` drops in.

### Epic 4: Trophy drawer (§8, §9)

**4.1 Leaderboards tab** (opens first, on Tournament): pills Tournament / Daily Lake / Fort Builders. Today / Yesterday toggle on the two daily boards only. Top 25 + the player's own row if outside it (dark row). Rank chips are yellow for the top 3. Banner shows "RESETS 12:00 AM ET" / "FINAL STANDINGS • NOV 15".
- Ranking: Tournament = fish desc, then earliest `reachedAt`. Daily = fish desc, drills left desc, earliest finish. Fort Builders = snow desc, earliest `reachedAt`.
- Admin-only **Reset** on Fort Builders, with confirmation (starting a new fort does not reset it).

**4.2 Badges tab**: "x of y badges". Four across with the name only and the description as a tooltip. Earned = filled, locked = dashed outline. **Icons always come from the ecosystem catalog** (per rules.md). Read `forceRefreshInventory` from the URL and pass it through.

| Group | Badges (trigger) |
|---|---|
| Fishing | First Catch (1 fish), Angler (25), Expert Angler (100), Master Angler (500), Perfect Lake (1 perfect), Sonar Pro (5 perfect) |
| Daily Lake | Daily Catch (1st daily finished), Special Catch (special fish), Five-Day Fisher (5 dailies), Fifteen-Day Fisher (15); stretch: Special Collector (5 different), Full Net (all 10) |
| Fishing Tournament | Tournament Angler (finished 1 tournament lake), Top Ten, On the Podium (top 3), Tournament Champion (#1) |
| Snow Fort | Fort Builder (first snow), Foundation Crew, Wall Crew, Tower Crew, Flag Raiser |

19 badges in v1 (+2 stretch). Fishing badges count activity across worlds. Fort badges are earned in the world where the milestone is reached.

### Epic 5: Daily rollover (§5.4.6)

**5.1** On the first request after 12:00 am ET (any endpoint that loads world state): take a rollover lock keyed by the new `dayKey`. Freeze yesterday's top 25 for both daily boards, record the top 10 in `tournamentHistory`, fire the `tournamentEnds-*` analytics, clear today's boards, set `dayKey`. Exactly-once: re-check `dayKey` after acquiring the lock.

**5.2** Players get their yesterday toast and tournament badges lazily on their next open (§4.2).

### Epic 6: Admin Settings (§7)

**6.1** The gear opens Admin Settings: Fort goal (1,000 / 10,000 / **30,000** / 50,000 / 100,000), Tournament lakes per day (5 / **10** / 20 / No limit), [Start a new fort] (red) with the confirmation copy from §7 and [Keep Fort] / [Start New Fort].

**6.2** Start new fort: `fortNumber++`, worldSnow/bricks/milestones/builderCount reset, all 50 pieces back to transparent (reconcile pass). Badges and leaderboards are untouched. Fire `fortRestarts-castle`.

**6.3** All admin routes check `visitor.isAdmin` server-side.

**6.4** Admin Settings shows the missing-blocks warning from §4.1 when any slot has no asset.

### Epic 7: How to Play (§10): removed

Not in the app (decided 11/20). No screen, no ? button, no world asset.

### Epic 8: Analytics (§14)

**8.1** Fire the event list from §14 through the `analytics` option on our existing data-object writes (no extra calls). Each event carries `profileId`, `uniqueKey`, `urlSlug`.
- `appOpens`, `fishingDrawerOpens`, `fortDrawerOpens`, `leaderboardViews-{tournament|dailyLake|fortBuilders}` (opening the Trophy counts as tournament)
- `lakeStarts-{daily|tournament}`, `lakeFinishes-{daily|tournament}`, `lakeFinishes-{0..7}fishLeft`, `specialCatches`
- `castleFortBrickPlacements`, `castleFortMilestoneReaches-{foundation|walls|towers|keep}`, `fortRestarts-castle`
- `badgeEarns-{badgeName}`
- **Answer to the §14 open question:** analytics entries accept `incrementBy`, so `tournamentEnds-playersEntered` and `tournamentEnds-topScore` can each be **one** entry at rollover with `incrementBy: <count>`. No need to fire once per player or once per fish.

### Epic 9 (stretch): Special Catches (§5.6)

10 special fish rotate one per day (seeded by day). Row of 10 tiles under the reminder (Daily selected only). Tooltip shows "Northern Pike · Caught Dec 3" / "Not caught yet". Special Collector + Full Net badges.

### Epic 10 (v2, not in this build): Fort varieties (§6.5)

Variety layouts plus `updatePosition()` on start-new-fort (§4.1), a variety picker / Surprise in Admin, a "Forts you've helped build" row, and the 4 builder badges. The data model already carries `variety` and `snowThisFort` per `fortNumber` so this adds on without migration.

## 7. Implementation Plan

### File tree delta

```
shared/
  types/            Lake.ts, Visitor.ts, World.ts, Leaderboard.ts, Badges.ts, index.ts
  lake/             rng.ts (seededRng, from Birdwatch), generate.ts, solver.ts, helper.ts, neighbors.ts
  fort/             constants.ts (slots, sections, thresholds), layouts/castle.ts, themes.ts (piece art URLs)
  constants.ts      SNOW values, DRILLS, LAKE size, badge names, analytics names
server/
  controllers/
    handleGetGameState.ts      GET  /api/game-state         (fishing drawer payload; runs rollover + lazy awards)
    handleGetFort.ts           GET  /api/fort               (fort drawer payload)
    handleGetTrophy.ts         GET  /api/trophy             (leaderboards + badges)
    handleDrill.ts             POST /api/lake/drill         { kind, hole }
    handleDrawerActions.ts     POST /api/leaderboard-view { board }
    handleUpdateAdminSettings.ts POST /api/admin/settings   { fortGoal?, tournamentLakesPerDay? }
    handleStartNewFort.ts      POST /api/admin/start-new-fort
    handleResetLeaderboard.ts  POST /api/admin/reset-leaderboard
  utils/
    getVisitor.ts (adapt), world/getWorldData.ts (init defaults), world/rollover.ts, world/withWorldLock.ts
    lake/finishLake.ts (snow, leaderboards, brick math; the single locked world write)
    fort/reconcileFortPieces.ts (lookup by unique name, parse slots, swap images, report missing)
    badges/getBadges.ts, badges/awardBadges.ts (lazy checks), inventoryCache (per .ai/examples)
    leaderboard/parse.ts, leaderboard/rank.ts
    time/etDayKey.ts
  tests/            routes.test.ts + lake engine tests
client/src/
  pages/            Home.tsx (`/` → FishingView), FortView (`/fort`), TrophyView (`/trophy`); AdminView renders Admin Settings
  components/       Lake/ (Lake, Hole), Counters, Banner, LakeSwitch, ResultCard, TournamentStrip, FortStrip,
                    FortPicture, SectionList, LeaderboardList, BadgeGrid, DrawerHeader, SpecialCatches (stretch)
  styles/           tokens.css (Frost), components.css (from Trivia), lake.css, animations.css
  sfx/              placeholder hooks until Shelby's files land
```

Routing: see §5.2 (path routes `/`, `/fort`, `/trophy`). The server resolves the fort and world state by `urlSlug`, independent of which asset opened the drawer.

### API (all responses `{ success: true, data }`; errors `{ success: false, message }`)

```ts
GET  /api/game-state?kind=daily|tournament&open=true   → FishingState { isAdmin, lake: LakeView, dailyRank, tournament: TournamentSummary, fort: FortSummary }
POST /api/lake/drill { kind, hole }                    → DrillResponse { lake, newlyMarked, caughtFish, caughtSpecial, justFinished, addedBrick, fort?, tournament?, dailyRank? }
                                                         400 invalid/finished/locked/out of lakes · 409 raced double tap (client ignores)
GET  /api/fort?open=true                               → FortView { fort, variety, youAdded, builderCount, sections[] }
GET  /api/trophy?open=true&forceRefreshInventory=      → TrophyState { isAdmin, lakesPerDay, leaderboards{tournament{today,yesterday}, dailyLake{today,yesterday}, fortBuilders}, yesterdayDayKey, badges[] }
POST /api/leaderboard-view { board }                   → leaderboardViews-{board} analytics
GET  /api/admin/settings                               → AdminState { settings, missingSlots, fortNumber } (runs a reconcile pass)
POST /api/admin/settings { fortGoal?, tournamentLakesPerDay? }  → AdminState + fort
POST /api/admin/start-new-fort                         → AdminState + fort
POST /api/admin/reset-leaderboard                      → clears Fort Builders, bumps fortBuildersEpoch
```

`open=true` is sent only on the first load of each drawer in an iframe session; it runs the lazy checks (badges, yesterday toast) and the open analytics in one visitor write.

### State management

`GlobalContext` holds the `gameState` slice per drawer (lake view, tournament, fort summary, trophy). Each drawer fetches its own payload once on open via `backendAPI` (the SDK-app pattern). There is **no polling**. Fort numbers refresh on the next drawer open, and the world itself shows bricks live. SSE is not needed in v1, since no drawer has to react live to another player.

## 8. Build Order (11 days to launch, so phases are cut-lines)

| Phase | Work | Done when | Status (11/20) |
|---|---|---|---|
| **0. Setup** ✅ | Submodule, deps, plan.md, app context in CLAUDE.md | This doc | ✅ |
| **1. Puzzle engine** | `shared/lake/*` + tests: generation constraints, Helper, solver, determinism of the Daily seed, a 2,000-lake stat check (≥5 always, ~79% all 7) | Engine tests green | ✅ Code + tests (2,000 lakes: 81% perfect, ≥5 always) |
| **2. Fishing drawer** | game-state / start / drill routes, visitor data + resume, Fishing UI + Frost styles + animations, result card | Daily lake playable end-to-end on dev | 🟡 Code complete, tests green, UI checked against mockups. Needs a dev world |
| **3. Snow Fort** | Locked lake-finish write, brick math, piece lookup + image swap + particles, milestones, toasts, Fort drawer + picture, drawer-to-drawer | Bricks appear live in a dev world | 🟡 Code complete + tests. Needs a dev world with the scene |
| **4. Tournament + rollover** | Tournament lakes and limits, carry-over across midnight, rollover, Trophy drawer leaderboards (Today/Yesterday) | Simulated midnight works (inject clock) | 🟡 Code complete + tests (injected clock) |
| **5. Badges + analytics** | Inventory ZIP (**read `docs/claude/inventory-zip-format.md` first**), lazy awards, Badges tab, §14 events | All 19 badges grantable | 🟡 Awards/Badges tab/events done. Inventory ZIP not built yet (needs Shelby's art) |
| **6. Admin + polish** | Admin settings + start new fort + leaderboard reset, SFX hooks, a11y pass, reduced motion | Keyboard + axe pass | 🟡 Admin done; SFX hooks stubbed (no files yet); keyboard/axe pass pending |
| **7. Hardening** | Load test the lake-finish path (qa-tools, **read `docs/claude/qa-tools.md` first**), finalize README / tests / CLAUDE.md (§10) | Ready for WW | ⬜ |
| Stretch | Special Catches | Only if Phases 1–7 are done | ⬜ |

## 9. Testing Approach

- **Engine (pure):** generator constraints (clue adjacency, non-zero, solver ≥5), Helper cases from §4 (2 with 2 caught, 2 with 1, a 0), end conditions, Daily determinism (same `dayKey` gives the same lake), reading-order tie-breaks.
- **Routes (Jest + SDK mock):** each route's success / validation / admin-gate paths. Drill rejects marked, drilled or out-of-range holes and finished lakes. The finish path writes the world once with the right snow, leaderboard and brick values. Rollover is exactly-once. Lazy badge awards. Start new fort resets pieces.
- **Missing pieces:** reconcile with slots deleted / duplicated / unparseable names reports the missing slots and still updates the rest.
- **Mock additions:** `World.fetchDroppedAssetsWithUniqueName`, `World.triggerParticle`, `World.fireToast`, `DroppedAsset.updateWebImageLayers`, `Visitor.openIframe/grantInventoryItem`, `EcosystemFactory`.
- **Clock:** inject `now()` so rollover and the ET boundary (incl. DST) are testable.

## 10. Validation & Finalization Checklist

- [ ] All v1 stories meet acceptance criteria. Stretch is explicitly in or out.
- [ ] Protected files untouched. `AdminIconButton` / `AdminView` unmodified.
- [ ] Shared types only in `shared/types`. Aliased imports.
- [ ] Every SDK call server-side, in try/catch, using the standard response schema.
- [ ] Data objects initialized with defaults before any `updateDataObject`. One write per data object per controller.
- [ ] WCAG 2.1 AA: keyboard play, labels, live regions, reduced motion, no color-only meaning.
- [ ] Unused boilerplate removed. Barrels updated.
- [ ] `README.md` rewritten per the boilerplate template, including **Required Assets with Unique Names** (§5.2).
- [ ] Root `CLAUDE.md` replaced with `.ai/templates/CLAUDE.md` + app context.
- [ ] `server/tests/routes.test.ts` covers all routes. Tests pass.
- [ ] Commit to `dev`, push, PR `dev` → `main` (only when asked).

## 11. Decisions Log (formerly Open Questions, answered by Lina 11/20)

1. **Drilling authority:** server checks each drill (§4.3).
2. **"One attempt" and the tournament cap:** per scene.
3. **Clickable bricks:** no.
4. **Drawer picture vs admin edits in the world editor:** acceptable for v1.
5. **Fort Sign completion art:** no. The sign stays as is; completion shows in the drawer and the toast.
6. **Scene:** Lina builds it manually with the unique names in §5.2.
7. **Ecosystems:** all, eventually. The build targets **Topia** only; Lina imports inventories to the other ecosystems after everything is approved.
8. **Admin gear:** matches the mockup (header gear, custom Admin Settings in `AdminView`).

### Still needed (not blocking the build)

- **Art:** brick, tower top, flag PNGs (placeholders ship until then), the special-fish icon, the 19 badge icons, the particle name for the brick sparkle, and SFX files.

### Verify on a dev world (assumptions the tests can't prove)

1. **`&` in unique names.** The SDK puts the unique name in the URL path unencoded (`/assets-with-unique-name/Fishers&Forts_fortBlock_`). `&` is legal in a path, so lookups should work; confirm the 50 blocks are found.
2. **Held locks as compare-and-swap** (§4.4). Fort writes use `releaseLock: false` with a lock id derived from the fort state. Confirm a held lock rejects a second writer and that held locks expire on their own.
3. **Path links.** Confirm the `/fort` and `/trophy` iframe links load with the session params Topia appends.
4. **Piece art layer.** The app writes the top layer (`updateWebImageLayers("", url)`). Place the blocks as web-image assets so the swap renders.
