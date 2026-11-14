// The token radar's value model: one snapshot of the protocol universe in, one ranked board out.
//
// The board is the watchlist plus a capped set of pre-token protocols below the watchlist floor. The
// watchlist is the floor, never a ceiling. The snapshot's live-token protocols are kept out of the
// ranking: they are the evidence for the multiple, not rows to be scored.
//
// The multiple is derived from the snapshot itself, never from a hand-set constant and never from a
// named protocol:
//
//   sample ratio = mcap_usd / tvl_usd, clamped to [0.05, 5], for protocols with a market cap and TVL
//   overall      = median of every clamped sample
//   category     = median of that category's clamped samples, only when it has at least 3
//
// A pre-token protocol then gets:
//
//   multiple   = its category's median when it has 3 or more samples, else the overall median
//   growthPct  = clamp(change_7d ?? 0, -60, 120)
//   growthMult = 1 + (growthPct / 100) * 0.5
//   age        = ageDays(as_of, listed_at) ?? 365
//   maturity   = 0.6 + (min(age, 1095) / 1095) * 0.4
//   implied    = max(1, round(tvl_usd * multiple * growthMult * maturity))
//
// No protocol name is special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the rules quote them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  ratio_floor: number;
  ratio_cap: number;
  min_category_samples: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  ratio_floor: 0.05,
  ratio_cap: 5,
  min_category_samples: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2-median';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the live panel carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A category's derived mcap/TVL median and the number of samples behind it. */
export interface CategoryMultiple {
  median: number;
  samples: number;
}

/** The multiples the model derives from the snapshot's live-token protocols. */
export interface Multiples {
  overall_median: number;
  overall_samples: number;
  categories: Record<string, CategoryMultiple>;
  min_category_samples: number;
  ratio_floor: number;
  ratio_cap: number;
}

/** One live-token sample: the protocol and its clamped mcap/TVL ratio. */
export interface LiveSample {
  protocol: SnapshotProtocol;
  ratio: number;
}

/** One row of board.json: the ranked board's row, with every factor exposed. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  multiple: number;
  multiple_source: 'category' | 'overall';
  multiple_samples: number;
  category_median: number | null;
  category_samples: number;
  overall_median: number;
  overall_samples: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  implied_value_usd: number;
  farm: FarmStep[];
  farm_steps: string[];
}

/** The dashboard's view of one row: the same factors plus the farm plan as objects. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  multiple: number;
  multiple_source: 'category' | 'overall';
  multiple_samples: number;
  category_median: number | null;
  category_samples: number;
  overall_median: number;
  overall_samples: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  implied_value_usd: number;
  farm: FarmStep[];
  farm_steps: string[];
}

/** A live-token protocol: the market's own multiple, never ranked against pre-token protocols. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number;
}

/** Everything the dashboard needs: the board, the live comparison set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants;
  multiples: Multiples;
  protocol_count: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The ordinary median: sorted ascending, the two middle values averaged on an even count. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Every live-token sample in the snapshot, with its ratio clamped to the model's range. */
export function liveRatios(snapshot: Snapshot, model: ModelConstants = MODEL): LiveSample[] {
  const samples: LiveSample[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || !(p.tvl_usd > 0)) continue;
    samples.push({ protocol: p, ratio: clamp(p.mcap_usd / p.tvl_usd, model.ratio_floor, model.ratio_cap) });
  }
  return samples;
}

/** The overall and category medians a set of live-token samples supports. */
function multiplesFromSamples(samples: LiveSample[], model: ModelConstants): Multiples {
  const groups = new Map<string, number[]>();
  for (const sample of samples) {
    const category = sample.protocol.category;
    if (category === null) continue;
    const list = groups.get(category);
    if (list === undefined) groups.set(category, [sample.ratio]);
    else list.push(sample.ratio);
  }
  const categories: Record<string, CategoryMultiple> = {};
  for (const [category, ratios] of groups) {
    if (ratios.length < model.min_category_samples) continue;
    const value = median(ratios);
    if (value !== null) categories[category] = { median: value, samples: ratios.length };
  }
  return {
    overall_median: median(samples.map((s) => s.ratio)) ?? 1,
    overall_samples: samples.length,
    categories,
    min_category_samples: model.min_category_samples,
    ratio_floor: model.ratio_floor,
    ratio_cap: model.ratio_cap,
  };
}

/** The multiple the snapshot's own live-token protocols support, overall and by category. */
export function deriveMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Multiples {
  return multiplesFromSamples(liveRatios(snapshot, model), model);
}

/** The scored factors one pre-token protocol gets under a set of derived multiples. */
export interface ImpliedResult {
  implied: number;
  multiple: number;
  multiple_source: 'category' | 'overall';
  multiple_samples: number;
  category_median: number | null;
  category_samples: number;
  overall_median: number;
  overall_samples: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
}

/**
 * Score one pre-token protocol. The category median is used only when the category has at least the
 * model's minimum number of samples; otherwise the overall median carries the row. `categorySamples`
 * is the category's full sample count, even when it is too small to supply a median.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: Multiples,
  categorySamples = 0,
): ImpliedResult {
  const category = protocol.category === null ? undefined : multiples.categories[protocol.category];
  // A category median exists only at the minimum sample size; below it the overall median carries the row.
  const useCategory = category !== undefined && category.samples >= model.min_category_samples;
  const selected = clamp(useCategory ? category.median : multiples.overall_median, model.ratio_floor, model.ratio_cap);

  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const growthPct = clamp(protocol.change_7d === null ? 0 : protocol.change_7d, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = protocol.tvl_usd * selected;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));

  return {
    implied,
    multiple: selected,
    multiple_source: useCategory ? 'category' : 'overall',
    multiple_samples: useCategory ? category.samples : multiples.overall_samples,
    category_median: useCategory ? category.median : null,
    category_samples: categorySamples,
    overall_median: multiples.overall_median,
    overall_samples: multiples.overall_samples,
    growthPct,
    growthMult,
    maturityMult,
    age: ageForModel,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Compare slugs without locale dependence. */
function slugOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const samples = liveRatios(snapshot, model);
  const multiples = multiplesFromSamples(samples, model);
  const categoryCounts = new Map<string, number>();
  for (const sample of samples) {
    const category = sample.protocol.category;
    if (category === null) continue;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug in it is on the board.
  for (const slug of snapshot.watchlist) {
    const protocol = index.get(slug);
    if (protocol !== undefined) chosen.set(slug, protocol);
  }
  // The early radar: the top pre-token protocols below the floor by TVL, never the CEX or a versioned pool.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || slugOrder(a.slug, b.slug))
    .slice(0, EARLY_ROWS);
  for (const protocol of early) chosen.set(protocol.slug, protocol);

  const scored = [...chosen.values()].map((protocol) => {
    const categorySamples = protocol.category === null ? 0 : (categoryCounts.get(protocol.category) ?? 0);
    return { protocol, result: impliedValue(protocol, snapshot.as_of, model, multiples, categorySamples) };
  });
  scored.sort((a, b) => b.result.implied - a.result.implied || slugOrder(a.protocol.slug, b.protocol.slug));

  return scored.map(({ protocol, result }, i) => {
    const farm = farmSteps(protocol, result.age);
    return {
      rank: i + 1,
      slug: protocol.slug,
      name: protocol.name,
      category: protocol.category,
      chains: protocol.chains,
      tvl_usd: protocol.tvl_usd,
      change_7d: protocol.change_7d,
      mcap_usd: protocol.mcap_usd,
      listed_at: protocol.listed_at,
      gecko_id: protocol.gecko_id,
      symbol: protocol.symbol,
      token_status: 'pre-token',
      age_days: result.age,
      multiple: result.multiple,
      multiple_source: result.multiple_source,
      multiple_samples: result.multiple_samples,
      category_median: result.category_median,
      category_samples: result.category_samples,
      overall_median: result.overall_median,
      overall_samples: result.overall_samples,
      growth_pct: result.growthPct,
      growth_multiplier: result.growthMult,
      maturity_multiplier: result.maturityMult,
      implied_value_usd: result.implied,
      farm,
      farm_steps: farm.map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  const tail = ` Cost: ${step.cost}. Time: ${step.time}.`;
  const room = Math.max(1, 600 - tail.length);
  let action = step.text.trim();
  if (action.length > room) action = `${action.slice(0, Math.max(0, room - 3)).trimEnd()}...`;
  let text = `${action}${tail}`;
  if (text.length < 20) text = `${text} Check the protocol's own page first.`;
  return text;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 40;
}

/** A budgeted gas estimate from the first chain the protocol names. */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes('solana')) return 0.2;
  if (c.includes('ethereum')) return 6;
  if (
    c.includes('arbitrum') ||
    c.includes('optimism') ||
    c.includes('base') ||
    c.includes('polygon') ||
    c.includes('unichain') ||
    c.includes('linea') ||
    c.includes('scroll') ||
    c.includes('zksync') ||
    c.includes('blast') ||
    c.includes('mantle') ||
    c.includes('ink')
  ) {
    return 1;
  }
  return 3;
}

/** A dollar amount for a step's cost line. */
function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age !== null && age < 180) return 60;
  if (age !== null && age < 365) return 45;
  return 30;
}

/** The category's one concrete action, in words a farmer can follow on the first chain. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const amount = `$${capital}`;
  if (c.includes('prediction')) return `Fund ${amount} of USDC on ${name} and place one small position in a market you can explain.`;
  if (c.includes('insurance')) return `Buy ${amount} of cover from ${name} on ${chain} and keep the policy receipt.`;
  if (c.includes('rwa')) return `Mint ${amount} of ${name}'s yield asset on ${chain} and keep the receipt token.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge ${amount} of USDC to ${chain} through ${name} and use the bridged funds once in its app.`;
  if (c.includes('stable')) return `Mint or deposit ${amount} of the stable asset through ${name} on ${chain} and keep the position open.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('credit')) {
    return `Supply ${amount} of USDC to ${name} on ${chain}, borrow a small amount against it, and keep both positions open.`;
  }
  if (c.includes('staking') || c.includes('restak')) return `Stake ${amount} of the chain's staking asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option') || c.includes('synthetic') || c.includes('basis')) {
    return `Deposit ${amount} of USDC as margin on ${name} and open one small hedged position on ${chain}.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) {
    return `Deposit ${amount} into one ${name} vault on ${chain} and keep the vault shares.`;
  }
  if (c.includes('dex') || c.includes('farm') || c.includes('yield') || c.includes('leverage')) {
    return `Provide ${amount} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (c.includes('launchpad')) return `Commit ${amount} of USDC to one launch on ${name} and keep the allocation receipt.`;
  return `Deposit ${amount} of USDC into ${name} on ${chain}, use one core action, and keep the position open.`;
}

/**
 * A protocol's farm plan: six concrete steps, each an action with a cost and a time. The plan comes
 * only from the protocol's own record: category, chains, TVL and age.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(chain);
  const weeklyGas = Math.max(1, Math.round(gas));
  const hold = holdDaysFor(age);
  const amount = `$${capital}`;
  return [
    {
      text: `Create a fresh wallet for this position, fund it with the ${amount} budget plus gas, and keep the seed phrase offline.`,
      cost: `about ${money(gas)} for the first transaction`,
      time: '5 to 10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `${amount} of capital plus about ${money(gas)} of gas`,
      time: '15 minutes',
    },
    {
      text: `Make one qualifying action every week for 8 weeks, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about ${money(weeklyGas)} of gas each week`,
      time: '10 minutes a week',
    },
    {
      text: `Keep the ${amount} in the position for at least ${hold} days and do not move it between wallets.`,
      cost: `the ${amount} stays in the position, with no extra spend`,
      time: `${hold} days`,
    },
    {
      text: `Read ${p.name}'s own documentation and points page before depositing, and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 to 15 minutes',
    },
    {
      text: `Unwind the position in one transaction and write the wallet, dates, amounts and transaction hashes into a farm log.`,
      cost: `about ${money(gas)} of exit gas`,
      time: '20 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, with the market's own mcap/TVL ratio. */
export function buildLiveRows(snapshot: Snapshot, model: ModelConstants = MODEL): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || slugOrder(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: (p.mcap_usd ?? 0) / p.tvl_usd,
    }));
}

/** A board row's form for data.js, with the farm plan kept as objects for the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    token_status: row.token_status,
    age_days: row.age_days,
    multiple: row.multiple,
    multiple_source: row.multiple_source,
    multiple_samples: row.multiple_samples,
    category_median: row.category_median,
    category_samples: row.category_samples,
    overall_median: row.overall_median,
    overall_samples: row.overall_samples,
    growth_pct: row.growth_pct,
    growth_multiplier: row.growth_multiplier,
    maturity_multiplier: row.maturity_multiplier,
    implied_value_usd: row.implied_value_usd,
    farm: row.farm,
    farm_steps: row.farm_steps,
  };
}

/** Strip a source's address for display, leaving the publisher and its fetch time. */
function sourceLabel(source: string): string {
  const clean = source
    .replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s,;]+/g, '')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean.length > 0 ? clean : 'snapshot';
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const multiples = deriveMultiples(snapshot, model);
  const live = buildLiveRows(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: sourceLabel(snapshot.source),
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model,
    multiples,
    protocol_count: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${String(ranks[i])}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  const distinct = new Set(board.map((r) => r.implied_value_usd));
  if (distinct.size < 2) return `all ${board.length} rows share ${distinct.size} implied value${distinct.size === 1 ? '' : 's'}: the board is not a ranking`;
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${String(r.implied_value_usd)}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
