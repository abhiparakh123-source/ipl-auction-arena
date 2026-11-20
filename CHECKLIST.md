# IPL Auction Arena — Feature Checklist

Statuses: Not started / In development / Implemented / Tested / Verified.
"Tested" = exercised by automated scripts (WebSocket smoke test and/or Playwright browser runs) on the production build.
"Verified" is reserved for features confirmed by the owner on the hosted deployment — none are marked Verified yet.

Last updated: 2026-11-20

## Core architecture
| Feature | Status | Notes |
|---|---|---|
| Single shared game state (auction → squads → AI → XI → sim → tournament) | Tested | One Room state object per room on the server; all tabs read it |
| Server-authoritative bids, purses, ownership, countdown, purchases, results, standings | Tested | Clients only send intents; server validates and broadcasts |
| Duplicate purchase / invalid bid / negative purse prevention | Tested | Bid seq check + purse/squad/overseas checks; "already highest bid" and min-bid rejections observed |
| SQLite persistence + room recovery after restart | Implemented | Rooms snapshot to SQLite and reload on boot; hosted sandbox storage may not survive redeploys |
| Append-only audit log, undo recorded not erased | Tested | Audit tab shows every action |

## Multiplayer
| Feature | Status | Notes |
|---|---|---|
| Guest / register / sign-in accounts | Tested | |
| Rooms, codes, invite links, join page | Tested | Two browser clients joined via invite link |
| Public room list | Implemented | |
| Lobby: take franchise, ready, host start, kick, host transfer | Tested (take/ready/start) | Kick & host transfer implemented, not browser-tested |
| Spectators | Implemented | |
| Reconnection (reload mid-auction) | Tested | Identity restored via visitor id; stage resumes |
| Chat, online status, latency indicator | Implemented | |
| Friends, invites, private leagues | Implemented | |

## Auction engine & modes
| Feature | Status | Notes |
|---|---|---|
| Live bidding, increments, timers, intro phase | Tested | Two clients bidding live |
| Host pause/resume, hammer now, undo last sale, end auction, re-auction unsold | Tested (pause/resume/end) | Undo/re-auction implemented |
| RTM flow | Implemented | Mega mode with retentions |
| Rulesets from cited sources (not hardcoded in UI) | Implemented | |
| Mega, Mini (real 2026 retentions), Quick, Custom, Marquee, Uncapped, Legends (eras), Blind (sealed), Championship (multi-season), AI Challenge | Implemented | Quick tested end-to-end in browser; Mega/real-2026 room start tested; others exercised in earlier server tests only |
| AI owners with distinct personalities | Tested | |
| Auction intelligence never bids for the player | Implemented | Advice only; bid needs a click / key press |

## Data
| Feature | Status | Notes |
|---|---|---|
| 856 players, IPL stats 2008–2026 from Cricsheet | Tested | Leaderboards match computed data |
| Season-wise, phase, venue, opponent, chase, home/away, pace/spin splits | Tested | Bug fixed 2026-11-20 (splits were not reaching the profile) |
| Auction history (2025/2026 from Wikipedia personnel lists) | Implemented | |
| Provenance + generated date on records | Implemented | |
| Search, filters, sort, compare | Tested | |
| CSV / JSON import & export, edit, duplicate detection, photo manager | Implemented | Not browser-tested this pass |
| Player photos | Implemented | 367 freely licensed Wikimedia Commons photos with credits; others get an SVG jersey avatar. Official IPL jersey headshots are BCCI/IPL copyrighted and not bundled; owners can add their own photo URL/upload per player |

## Analysis, simulation, tournament
| Feature | Status | Notes |
|---|---|---|
| AI Intelligence Centre (15 panels, each with explanation & data-type label) | Tested (renders) | |
| Playing XI builder, C/VC/WK, impact player, field placement | Tested (renders, auto-XI) | |
| Ball-by-ball match simulator, scorecards, commentary, charts, "Simulated" labels | Tested | |
| Room season: fixtures, points table w/ NRR, playoffs, awards, champion | Tested | Full flow in browser and via WebSocket |
| Custom tournament builder | Tested | |
| Power rankings, records (real vs in-game kept separate) | Tested (renders) | |
| What-If Lab (never overwrites history) | Implemented | |
| Trades & marketplace | Implemented | |
| Career mode, trading cards, trophies/achievements (cosmetic only) | Implemented | |

## Presentation
| Feature | Status | Notes |
|---|---|---|
| 3D arena (three.js) with quality levels | Tested (renders in headless Chromium) | Frame rate varies by device; no FPS promise |
| 2D fallback when 3D is off / WebGL missing | Implemented | |
| Sound effects, music, crowd ambience with volume controls | Implemented | |
| Responsive layout (desktop + 375 px) | Tested | |

## Known limitations
- Hosted preview storage is a sandbox SQLite file; long-term durability needs a managed database.
- Friends on other devices can join only once the site is shared or published.
- Ratings, fair values, potentials and predictions are calculated models, labelled as such, not guarantees.

## Stage, sound and commentary upgrade (Nov 2026)
- [x] Auction stage rebuilt in two layers: 3D stadium backdrop (crowd lights, floodlight towers, sweeping beams, LED ribbon, bloom on high) + broadcast-style DOM player card. Photos are normal <img> elements, so they load reliably on the hosted site. Works with 3D off (CSS backdrop).
- [x] Players without a licensed photo get a team-coloured kit illustration, clearly labelled (no invented shirt numbers).
- [x] Sound engine rebuilt (original synthesized WebAudio): reverb bus, wooden gavel, paddle chime, lot-reveal whoosh, heartbeat ticks, sold fanfare + crowd roar + applause, unsold "aww", six/boundary/wicket, generative score that intensifies with bidding.
- [x] Live auction commentary: generated per lot from server state (reveal, opening bid, raises, big jumps, bidding wars, fair-value remarks, going once/twice, sold/unsold verdict). Shown as stage caption + "Live commentary" feed, labelled as generated. Career figures are historical (Cricsheet); value remarks are calculated.
- [x] Spoken auctioneer/commentator via browser speech synthesis (voice availability depends on device). Toggle in the feed, match replay and Profile → Audio & graphics.
- [x] Match replay speaks boundaries, wickets and innings breaks at 1x/2x.
- [x] "Tap for sound" prompt while the browser keeps audio locked; audio unlocks on any tap/key.
- [ ] Not verified by ear in this sandbox (headless browser has no speakers); verified that code paths run without errors.

## Update: auto-bid fix, multiplayer tests, voice, Hall of Fame
- [x] Fixed: AI could bid for a human-picked franchise (AI personality not cleared on team pick). `on_pickTeam` clears AI, `enforceControl()` runs on every state change, AI filters require `!ownerId`, and the server rejects AI bids for human teams. Verified: 0 bids on human teams not sent by their owner.
- [x] `tests/multiplayer.mjs`: 41/41 pass locally (4 humans + spectator, simultaneous bids, invalid bids, pause, reconnect, rate limit, purse integrity, cross-client agreement, season, blind privacy). Bid ack median 1 ms locally.
- [x] Commentary: 44 recorded voice clips (auctioneer + commentator) in `client/public/voice`, played via WebAudio; browser speech used only for names/prices where available, with captions always shown. Test voice button and tap-to-enable sound.
- [x] Hall of Fame (`/hall-of-fame`): interactive season slideshow 2008-2026 (autoplay, swipe, keys, timeline), trophy cabinet filter, all-time leaders, legends flip cards. Data from Cricsheet; 2026 final cross-checked with ESPNcricinfo and Wikipedia. Compact slideshow on Home.
- [x] Global decor: floodlight glows, rising particles, stadium silhouette, gold panel trim; disabled with graphics off / reduced motion.

## Update: decoration pass 2
- [x] Every page header is now a themed banner (per-page colours, cricket art, corner brackets, title shine, team-colour ribbon).
- [x] Scrolling champions ticker (real Cricsheet finals, links to Hall of Fame), site footer with data credits, grouped sidebar with active marker, panel accents, illustrated empty states, button shine.
- [x] All decoration is CSS/SVG only; animations stop with graphics off or reduced motion. Stage and full-flow browser tests pass.

## Formats update (T20I / ODI / Test)
- [x] 4 formats (IPL T20, T20I, ODI, Test) and 22 modes: 10 IPL + 4 per international format (India Now, India All-Time, Rest of the World, All-Stars)
- [x] International stats from Cricsheet men's T20I/ODI/Test ball-by-ball archives; 1377 players, 919 international-only, per-format ratings
- [x] Format-aware engine: 20/50 overs, 10-over spells, Tests with declarations, draws and WTC-style points (12/4)
- [x] Format filters in Player Universe, international record on profiles, format select in Match Simulator
- [x] tests/formats.mjs: 75/75 passed; tests/multiplayer.mjs: 41/41 passed
- [x] Fixed data errors: K Santokie country (West Indies), capped flag for active internationals
