// Shared game definitions: franchises, rulesets, modes, increments, types.
// Used by both the authoritative server and the client UI.

export type Role = "Batter" | "Bowler" | "All-rounder" | "Wicket-keeper";

export interface PlayerSummary {
  id: string;
  name: string;
  fullName: string;
  country: string;
  role: Role;
  bowlType: "Pace" | "Spin" | null;
  batting: string | null;
  bowling: string | null;
  capped: boolean;
  overseas: boolean;
  dob: string | null;
  photo: string | null; // relative path or custom URL
  photoCredit: string | null;
  basePrice: number; // crore (calculated game base price)
  ratings: { bat: number; bowl: number; overall: number; form?: number | null; consistency?: number | null; limited?: boolean };
  matches: number;
  runs: number;
  wkts: number;
  sr: number | null;
  avg: number | null;
  econ: number | null;
  team2026: string | null;
  price2026: number | null;
  status: string;
  legend: boolean;
  retired?: boolean;
  lastSeason: number | null;
  firstSeason: number | null;
  teams: string[];
  custom?: boolean;
  intlOnly?: boolean;
  fmtStats?: { matches: number; runs: number; wkts: number; sr: number | null; avg: number | null; econ: number | null; hs: number; c100: number; c50: number; w5: number; best: [number, number]; first: number; last: number; active: boolean; fmt: IntlFormat };
  fmts?: Partial<Record<IntlFormat, { m: number; runs: number; wkts: number; overall: number; active: boolean }>>;
  ppShare?: number;
  deathShare?: number;
}

export interface Franchise {
  id: string;
  name: string;
  short: string;
  city: string;
  primary: string;
  secondary: string;
  accent: string;
  home: string; // home venue
}

export const FRANCHISES: Franchise[] = [
  { id: "CSK", name: "Chennai Super Kings", short: "CSK", city: "Chennai", primary: "#F9CD05", secondary: "#0A4595", accent: "#FDB913", home: "MA Chidambaram Stadium" },
  { id: "MI", name: "Mumbai Indians", short: "MI", city: "Mumbai", primary: "#004BA0", secondary: "#D1AB3E", accent: "#2A6BDB", home: "Wankhede Stadium" },
  { id: "RCB", name: "Royal Challengers Bengaluru", short: "RCB", city: "Bengaluru", primary: "#D11D26", secondary: "#1C1C1C", accent: "#C9A13B", home: "M Chinnaswamy Stadium" },
  { id: "KKR", name: "Kolkata Knight Riders", short: "KKR", city: "Kolkata", primary: "#3A225D", secondary: "#B3A123", accent: "#6A3FA0", home: "Eden Gardens" },
  { id: "SRH", name: "Sunrisers Hyderabad", short: "SRH", city: "Hyderabad", primary: "#F26522", secondary: "#1A1A1A", accent: "#FF8A3D", home: "Rajiv Gandhi International Stadium" },
  { id: "RR", name: "Rajasthan Royals", short: "RR", city: "Jaipur", primary: "#E8308A", secondary: "#254AA5", accent: "#FF5CA8", home: "Sawai Mansingh Stadium" },
  { id: "DC", name: "Delhi Capitals", short: "DC", city: "Delhi", primary: "#17479E", secondary: "#E21B23", accent: "#3D6FD1", home: "Arun Jaitley Stadium" },
  { id: "PBKS", name: "Punjab Kings", short: "PBKS", city: "Mullanpur", primary: "#DD1F2D", secondary: "#A7A9AC", accent: "#FF4757", home: "Maharaja Yadavindra Singh International Cricket Stadium" },
  { id: "GT", name: "Gujarat Titans", short: "GT", city: "Ahmedabad", primary: "#1B2133", secondary: "#DBBE6E", accent: "#3B4A75", home: "Narendra Modi Stadium" },
  { id: "LSG", name: "Lucknow Super Giants", short: "LSG", city: "Lucknow", primary: "#0057E2", secondary: "#F28B00", accent: "#3D86FF", home: "Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium" },
];
export const FRANCHISE_BY_ID: Record<string, Franchise> = Object.fromEntries(FRANCHISES.map((f) => [f.id, f]));

export const HISTORIC_TEAMS: Record<string, string> = {
  DCG: "Deccan Chargers", PWI: "Pune Warriors India", KTK: "Kochi Tuskers Kerala", GL: "Gujarat Lions", RPS: "Rising Pune Supergiant",
};
export function teamName(id: string) {
  return FRANCHISE_BY_ID[id]?.name || HISTORIC_TEAMS[id] || id;
}

// ---------- Rulesets (sourced; never hard-coded into the engine) ----------
export interface Ruleset {
  id: string;
  label: string;
  purse: number; // crore
  squadMin: number;
  squadMax: number;
  overseasMax: number;
  overseasXI: number;
  overseasFeeCap: number | null; // crore; amount above cap goes to BCCI (team still pays bid)
  rtm: boolean;
  rtmCards: number;
  increments: { upTo: number; step: number }[]; // upTo exclusive in crore
  source: string;
}

export const RULESETS: Record<string, Ruleset> = {
  ipl2025: {
    id: "ipl2025", label: "IPL 2025 Mega Auction", purse: 120, squadMin: 18, squadMax: 25, overseasMax: 8, overseasXI: 4,
    overseasFeeCap: null, rtm: true, rtmCards: 6,
    increments: [{ upTo: 1, step: 0.05 }, { upTo: 2, step: 0.1 }, { upTo: Infinity, step: 0.2 }],
    source: "IPL Player Regulations 2025-27 as reported by Economic Times / ESPNcricinfo (purse ₹120 cr, 18-25 squad, 8 overseas, up to 6 retentions incl. RTM).",
  },
  ipl2026: {
    id: "ipl2026", label: "IPL 2026 Mini Auction", purse: 125, squadMin: 18, squadMax: 25, overseasMax: 8, overseasXI: 4,
    overseasFeeCap: 18, rtm: false, rtmCards: 0,
    increments: [{ upTo: 1, step: 0.05 }, { upTo: 2, step: 0.1 }, { upTo: Infinity, step: 0.2 }],
    source: "IPL 2026 auction rules as reported by ESPNcricinfo / Cricbuzz (₹125 cr cap, 18-25 squad, 8 overseas, overseas fee cap ₹18 cr, no RTM at mini auctions).",
  },
};

export function nextBid(current: number | null, base: number, rules: Pick<Ruleset, "increments">, multiplier = 1): number {
  if (current == null) return round2(base);
  const slab = rules.increments.find((s) => current < s.upTo) || rules.increments[rules.increments.length - 1];
  return round2(current + slab.step * multiplier);
}
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
export function fmtCr(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "—";
  if (n < 1) return `₹${Math.round(n * 100)} L`;
  return `₹${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")} Cr`;
}

// ---------- Modes ----------
export type IplModeId = "mega" | "mini" | "quick" | "custom" | "marquee" | "uncapped" | "legends" | "blind" | "championship" | "ai";
export type IntlFormat = "t20i" | "odi" | "test";
export type Format = "ipl" | IntlFormat;
export type IntlPool = "india_now" | "india_all" | "world" | "allstars";
export type ModeId = IplModeId | `${IntlFormat}_${IntlPool}`;

export interface FormatDef {
  id: Format; label: string; short: string; tagline: string; overs: number | null; bowlerMax: number | null; innings: 2 | 4; dayOvers?: number; days?: number;
  par: number; accent: string; description: string; xiOverseas: number | null; impact: boolean;
}
export const FORMATS: Record<Format, FormatDef> = {
  ipl: { id: "ipl", label: "IPL T20", short: "IPL", tagline: "Franchise cricket", overs: 20, bowlerMax: 4, innings: 2, par: 8.6, accent: "#F5C542", xiOverseas: 4, impact: true,
    description: "Ten franchises, real IPL rules, Impact Player and the full IPL 2008-2026 database." },
  t20i: { id: "t20i", label: "T20 International", short: "T20I", tagline: "20 overs, country caps", overs: 20, bowlerMax: 4, innings: 2, par: 8.0, accent: "#3DD6F5", xiOverseas: null, impact: false,
    description: "International T20 cricket. Ratings come from each player's T20I record, not their IPL record." },
  odi: { id: "odi", label: "One-Day International", short: "ODI", tagline: "50 overs a side", overs: 50, bowlerMax: 10, innings: 2, par: 5.3, accent: "#7CFF6B", xiOverseas: null, impact: false,
    description: "50-over cricket with 10-over bowling spells, three phases and ODI-specific ratings." },
  test: { id: "test", label: "Test cricket", short: "Test", tagline: "Five days, four innings", overs: null, bowlerMax: null, innings: 4, dayOvers: 90, days: 5, par: 3.3, accent: "#F2EAD3", xiOverseas: null, impact: false,
    description: "Two innings each over five simulated days. Declarations are simulated; follow-ons are not modelled; draws are possible." },
};
export const FORMAT_LIST: Format[] = ["ipl", "t20i", "odi", "test"];
export const modeFormat = (mode: string): Format => (MODE_BY_ID[mode]?.format || "ipl");

export interface RoomSettings {
  mode: ModeId;
  ruleset: string;
  purse: number;
  squadMin: number;
  squadMax: number;
  overseasMax: number;
  overseasFeeCap: number | null;
  rtm: boolean;
  rtmCards: number;
  bidTimer: number; // seconds after each bid
  introTimer: number; // seconds of cinematic intro before bidding opens
  incrementMultiplier: number;
  customIncrement: number | null; // fixed custom increment in crore
  pool: "active" | "all" | "marquee" | "uncapped" | "legends" | "mini2026" | "quick" | "custom" | "intl";
  poolSize: number | null;
  customPool: string[] | null;
  era: "2008-2012" | "2013-2017" | "2018-2022" | "2023-2026" | "all";
  blindVisibility: "hidden" | "after-lot" | "after-set";
  seasons: number; // championship
  retainMax: number; // championship: retentions between seasons
  purseTopUp: number; // championship: crore added per season
  aiFill: boolean;
  aiDifficulty: "easy" | "normal" | "hard" | "expert";
  reserveRule: boolean; // must keep enough purse to complete minimum squad at base 0.3
  customNames: Record<string, { name: string; short: string; primary: string; secondary: string }> | null;
  teamCount: number;
  isPublic: boolean;
  allowSpectators: boolean;
  unsoldRounds: number;
  marqueeSets: boolean;
  format: Format;
  intlPool: IntlPool | null;
}

export interface ModeDef {
  id: ModeId;
  format: Format;
  name: string;
  tagline: string;
  description: string;
  mechanics: string[];
  accent: string;
  defaults: Partial<RoomSettings>;
}

export const MODES: ModeDef[] = [
  {
    id: "mega", format: "ipl", name: "Mega Auction", tagline: "Build from scratch", accent: "#F5C542",
    description: "The full active IPL player pool. Every franchise starts with an empty squad and the IPL 2025 mega-auction rulebook.",
    mechanics: ["Full active pool (IPL 2024-26 + 2026 squads)", "Marquee sets first, then role-based capped & uncapped sets", "Right-to-Match cards (optional)", "₹120 cr purse, 18-25 squad, 8 overseas", "Unsold players return in an accelerated round"],
    defaults: { ruleset: "ipl2025", purse: 120, squadMin: 18, squadMax: 25, overseasMax: 8, rtm: true, rtmCards: 6, bidTimer: 12, introTimer: 5, pool: "active", marqueeSets: true, unsoldRounds: 1 },
  },
  {
    id: "mini", format: "ipl", name: "Mini Auction", tagline: "Real 2026 retentions", accent: "#3DD6F5",
    description: "Franchises begin with their real retained squads for IPL 2026 and the purses they actually took to Abu Dhabi. Released players and the 2026 auction pool go under the hammer.",
    mechanics: ["173 real retentions pre-loaded", "Actual remaining purses (₹2.75 cr MI – ₹64.3 cr KKR)", "Released & registered pool", "Overseas fee cap ₹18 cr", "No RTM (mini-auction rule)"],
    defaults: { ruleset: "ipl2026", purse: 125, squadMin: 18, squadMax: 25, overseasMax: 8, overseasFeeCap: 18, rtm: false, bidTimer: 12, introTimer: 4, pool: "mini2026", marqueeSets: false, unsoldRounds: 1 },
  },
  {
    id: "quick", format: "ipl", name: "Quick Auction", tagline: "15-minute sessions", accent: "#7CFF6B",
    description: "A compact 60-player pool, short timers and double increments for fast games with friends.",
    mechanics: ["60 players", "6-second bid clock", "2x bid increments", "₹60 cr purse, 11-15 squad, 5 overseas", "No unsold round"],
    defaults: { ruleset: "ipl2025", purse: 60, squadMin: 11, squadMax: 15, overseasMax: 5, rtm: false, bidTimer: 6, introTimer: 2, incrementMultiplier: 2, pool: "quick", poolSize: 60, marqueeSets: false, unsoldRounds: 0 },
  },
  {
    id: "custom", format: "ipl", name: "Custom Auction", tagline: "Your rules", accent: "#B57BFF",
    description: "Set the purse, squad sizes, increments, timers, pool and even rename the franchises.",
    mechanics: ["Custom purse & squad limits", "Custom fixed increment", "Choose any pool or hand-pick players", "Custom franchise names & colours", "Custom unsold rounds"],
    defaults: { ruleset: "ipl2025", pool: "active", bidTimer: 10, introTimer: 3, marqueeSets: false },
  },
  {
    id: "marquee", format: "ipl", name: "Marquee Auction", tagline: "Superstars only", accent: "#FF9F43",
    description: "Only the 48 highest-rated players. Tight ₹50 cr purses force brutal choices between stars.",
    mechanics: ["Top 48 by calculated overall rating", "Extended cinematic introductions", "₹50 cr purse, 3-6 squad", "₹2 cr base for all, 25 L+ increments", "Every lot is a marquee lot"],
    defaults: { ruleset: "ipl2025", purse: 50, squadMin: 3, squadMax: 6, overseasMax: 3, rtm: false, bidTimer: 10, introTimer: 7, pool: "marquee", poolSize: 48, incrementMultiplier: 1.25, marqueeSets: false, unsoldRounds: 1 },
  },
  {
    id: "uncapped", format: "ipl", name: "Uncapped Talent", tagline: "Find the next star", accent: "#00E0A4",
    description: "Indian players without an international cap. Development-focused squad building with scouting data.",
    mechanics: ["Indian uncapped pool only", "₹30 cr purse, 8-15 squad", "No overseas players", "Potential ratings shown", "Bargain detection weighted to youth"],
    defaults: { ruleset: "ipl2025", purse: 30, squadMin: 8, squadMax: 15, overseasMax: 0, rtm: false, bidTimer: 9, introTimer: 3, pool: "uncapped", marqueeSets: false, unsoldRounds: 1 },
  },
  {
    id: "legends", format: "ipl", name: "All-Time Legends", tagline: "Pick an era", accent: "#E6C27A",
    description: "Historical IPL players with era-specific statistics. Ratings are recalculated from the seasons you choose.",
    mechanics: ["Separate historical database (2008-2026)", "Era filter: 2008-12, 2013-17, 2018-22, 2023-26 or all-time", "Era-specific stats & ratings", "Retired legends included", "₹100 cr purse, 15-20 squad"],
    defaults: { ruleset: "ipl2025", purse: 100, squadMin: 15, squadMax: 20, overseasMax: 6, rtm: false, bidTimer: 10, introTimer: 5, pool: "legends", era: "all", marqueeSets: true, unsoldRounds: 1 },
  },
  {
    id: "blind", format: "ipl", name: "Blind Auction", tagline: "Sealed bids", accent: "#FF5C8A",
    description: "Every franchise submits one sealed bid per player. Opponent purses are hidden. Prices are revealed at the end of each set.",
    mechanics: ["One sealed bid per lot", "Hidden opponent purses", "Configurable reveal: per lot or per set", "Ties go to the earliest bid", "Pure valuation strategy"],
    defaults: { ruleset: "ipl2025", purse: 100, squadMin: 15, squadMax: 20, overseasMax: 6, rtm: false, bidTimer: 15, introTimer: 3, pool: "active", poolSize: 150, blindVisibility: "after-set", marqueeSets: false, unsoldRounds: 0 },
  },
  {
    id: "championship", format: "ipl", name: "Championship", tagline: "Multi-season dynasty", accent: "#4D7CFF",
    description: "Auction, play a full IPL season, retain your core, and return for the next auction. Franchises, budgets and records persist.",
    mechanics: ["2-5 seasons", "Full tournament each season", "Retain up to 4 players between seasons", "Purse top-ups & released pools", "Dynasty records & title history"],
    defaults: { ruleset: "ipl2025", purse: 100, squadMin: 15, squadMax: 22, overseasMax: 7, rtm: false, bidTimer: 10, introTimer: 3, pool: "active", seasons: 3, retainMax: 4, purseTopUp: 15, marqueeSets: true, unsoldRounds: 1 },
  },
  {
    id: "ai", format: "ipl", name: "AI Challenge", tagline: "Beat the machines", accent: "#00F0FF",
    description: "You against nine AI owners with distinct bidding personalities and adjustable difficulty.",
    mechanics: ["9 AI franchises", "Personalities: Aggressor, Moneyballer, Star Chaser, Youth Scout, Balanced", "Difficulty: easy to expert", "AI purse management & needs analysis", "Post-auction grade vs the AI"],
    defaults: { ruleset: "ipl2025", purse: 100, squadMin: 15, squadMax: 20, overseasMax: 6, rtm: false, bidTimer: 8, introTimer: 3, pool: "active", poolSize: 180, aiFill: true, aiDifficulty: "normal", marqueeSets: true, unsoldRounds: 1 },
  },
];

// ---------- International formats: 4 genuinely different pools per format ----------
// Team identities below are game-invented club names, not real teams.
const INDIA_SIDES = [
  { name: "India Blue", short: "IND-B", primary: "#1F5FD1", secondary: "#F59E0B" },
  { name: "India Orange", short: "IND-O", primary: "#F97316", secondary: "#1E3A8A" },
  { name: "India Green", short: "IND-G", primary: "#16A34A", secondary: "#F8FAFC" },
  { name: "India Gold", short: "IND-Y", primary: "#CA8A04", secondary: "#111827" },
];
const WORLD_SIDES = [
  { name: "Northern Strikers", short: "NOR", primary: "#2563EB", secondary: "#E5E7EB" },
  { name: "Southern Chargers", short: "SOU", primary: "#DC2626", secondary: "#FDE68A" },
  { name: "Eastern Tigers", short: "EAS", primary: "#EA580C", secondary: "#111827" },
  { name: "Western Storm", short: "WES", primary: "#7C3AED", secondary: "#F5D0FE" },
  { name: "Ocean Kings", short: "OCE", primary: "#0891B2", secondary: "#ECFEFF" },
  { name: "Desert Hawks", short: "DES", primary: "#B45309", secondary: "#FEF3C7" },
];
const FR_IDS = ["CSK", "MI", "RCB", "KKR", "SRH", "RR", "DC", "PBKS", "GT", "LSG"];
export const sidesFor = (pool: IntlPool, n: number) => Object.fromEntries((pool.startsWith("india") ? INDIA_SIDES : WORLD_SIDES).slice(0, n).map((c, i) => [FR_IDS[i], c]));
const FMT_WORD: Record<IntlFormat, string> = { t20i: "T20I", odi: "ODI", test: "Test" };
function intlModes(f: IntlFormat): ModeDef[] {
  const w = FMT_WORD[f];
  const sq = f === "test" ? { squadMin: 11, squadMax: 15 } : { squadMin: 11, squadMax: 16 };
  const common = { ruleset: "ipl2025", rtm: false, rtmCards: 0, pool: "intl" as const, format: f as Format, marqueeSets: false, unsoldRounds: 1, overseasFeeCap: null, bidTimer: 10, introTimer: 4 };
  return [
    { id: `${f}_india_now` as ModeId, format: f, name: `India Now`, tagline: `Current ${w} squad battle`, accent: "#3B82F6",
      description: `Only Indian players who have played ${f === "odi" ? "an" : "a"} ${w} since 2024. Two owners split the current national pool into India Blue and India Orange.`,
      mechanics: [`Indian ${w} players active 2024-2026`, "2 sides: India Blue vs India Orange", `${w}-only ratings from the ball-by-ball record`, "₹50 cr purse, 11-15 squad", `Season: ${f === "odi" ? "an ODI" : f === "test" ? "a Test" : "a T20I"} series`],
      defaults: { ...common, purse: 50, squadMin: 11, squadMax: 15, overseasMax: 0, teamCount: 2, intlPool: "india_now", customNames: sidesFor("india_now", 2) } },
    { id: `${f}_india_all` as ModeId, format: f, name: `India All-Time`, tagline: `Every Indian ${w} star since ${f === "t20i" ? "2006" : f === "odi" ? "2002" : "2001"}`, accent: "#F97316",
      description: `Indian ${w} players across the Cricsheet ball-by-ball era, retired and active. Four Indian sides draft generations against each other.`,
      mechanics: [`All Indian ${w} players with 3+ matches`, "4 Indian sides", "Retired greats priced from career ratings", "₹70 cr purse, 11-18 squad", "Full league + final"],
      defaults: { ...common, purse: 70, squadMin: 11, squadMax: 18, overseasMax: 0, teamCount: 4, intlPool: "india_all", customNames: sidesFor("india_all", 4) } },
    { id: `${f}_world` as ModeId, format: f, name: `Rest of the World`, tagline: "No Indians allowed", accent: "#22C55E",
      description: `The top 150 non-Indian ${w} players from Australia, England, South Africa, New Zealand, Pakistan, Sri Lanka, West Indies, Bangladesh and others.`,
      mechanics: [`Top 150 non-Indian ${w} players by rating`, "6 world sides", "No overseas cap", "₹80 cr purse, " + sq.squadMin + "-" + sq.squadMax + " squad", "League + playoffs"],
      defaults: { ...common, ...sq, purse: 80, overseasMax: sq.squadMax, teamCount: 6, poolSize: 150, intlPool: "world", customNames: sidesFor("world", 6) } },
    { id: `${f}_allstars` as ModeId, format: f, name: `World All-Stars`, tagline: "Best of every nation", accent: "#E6C27A",
      description: `The 72 highest-rated ${w} players of the era, any nation, retired or active. Four owners, tight purses, every lot a star.`,
      mechanics: [`Top 72 ${w} players by rating`, "4 all-star sides", "Every player ₹1.5 cr+ base", "₹60 cr purse, 11-15 squad", "Extended introductions"],
      defaults: { ...common, purse: 60, squadMin: 11, squadMax: 15, overseasMax: 15, teamCount: 4, poolSize: 72, introTimer: 6, intlPool: "allstars", customNames: sidesFor("allstars", 4) } },
  ];
}
MODES.push(...intlModes("t20i"), ...intlModes("odi"), ...intlModes("test"));
export const MODE_BY_ID: Record<string, ModeDef> = Object.fromEntries(MODES.map((m) => [m.id, m]));

export function defaultSettings(mode: ModeId): RoomSettings {
  const base: RoomSettings = {
    mode, ruleset: "ipl2025", purse: 100, squadMin: 15, squadMax: 22, overseasMax: 8, overseasFeeCap: null, rtm: false, rtmCards: 0,
    bidTimer: 10, introTimer: 3, incrementMultiplier: 1, customIncrement: null, pool: "active", poolSize: null, customPool: null,
    era: "all", blindVisibility: "after-set", seasons: 1, retainMax: 4, purseTopUp: 10, aiFill: true, aiDifficulty: "normal",
    reserveRule: true, customNames: null, teamCount: 10, isPublic: false, allowSpectators: true, unsoldRounds: 1, marqueeSets: false, format: "ipl", intlPool: null,
  };
  const m = MODE_BY_ID[mode];
  return { ...base, ...(m?.defaults || {}), mode, format: m?.format || "ipl" };
}

export const AI_PERSONALITIES = {
  aggressor: { label: "The Aggressor", desc: "Bids early and often, overpays for impact players.", overpay: 1.25, starBias: 1.1, youthBias: 1.0, valueBias: 0.9 },
  moneyball: { label: "The Moneyballer", desc: "Hunts undervalued performers, walks away at fair value.", overpay: 0.92, starBias: 0.95, youthBias: 1.05, valueBias: 1.25 },
  starchaser: { label: "The Star Chaser", desc: "Spends big on marquee names, fills the rest cheaply.", overpay: 1.15, starBias: 1.35, youthBias: 0.9, valueBias: 0.85 },
  youth: { label: "The Youth Scout", desc: "Prioritises young players with upside.", overpay: 1.0, starBias: 0.9, youthBias: 1.4, valueBias: 1.05 },
  balanced: { label: "The Balanced Owner", desc: "Builds to role needs with steady discipline.", overpay: 1.05, starBias: 1.0, youthBias: 1.0, valueBias: 1.0 },
} as const;
export type Personality = keyof typeof AI_PERSONALITIES;

export function ageOn(dob: string | null, year = 2026): number | null {
  if (!dob) return null;
  const y = parseInt(dob.slice(0, 4));
  return isNaN(y) ? null : year - y;
}

export const COMMENTARY_STYLES = {
  pro: "Professional broadcaster",
  energetic: "Energetic sports commentator",
  tactical: "Tactical cricket analyst",
  friends: "Light-hearted friends commentary",
} as const;
export type CommentaryStyle = keyof typeof COMMENTARY_STYLES;

export const PITCHES = {
  balanced: { label: "Balanced", runs: 1, pace: 1, spin: 1 },
  flat: { label: "Flat road", runs: 1.09, pace: 0.95, spin: 0.95 },
  green: { label: "Green seamer", runs: 0.94, pace: 1.12, spin: 0.95 },
  dry: { label: "Dry turner", runs: 0.95, pace: 0.95, spin: 1.15 },
  slow: { label: "Slow & low", runs: 0.9, pace: 1.0, spin: 1.06 },
} as const;
export type Pitch = keyof typeof PITCHES;
