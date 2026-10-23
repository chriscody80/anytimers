import type { Anytimer, Bet, Member } from "./types";

export function nameOf(members: Member[], id: string | null | undefined) {
  return members.find((m) => m.id === id)?.name || "Someone";
}

export function otherParty(bet: Bet, me: string) {
  return bet.proposer === me ? bet.opponent : bet.proposer;
}

export function loserOf(bet: Bet) {
  return bet.winner === bet.proposer ? bet.opponent : bet.proposer;
}

/** Anytimers not yet drunk: outstanding plus called-in. */
export function unpaid(timers: Anytimer[]) {
  return timers.filter((t) => t.status !== "redeemed");
}

export function stats(id: string, bets: Bet[], timers: Anytimer[]) {
  const open = unpaid(timers);
  const settled = bets.filter((b) => b.status === "settled" && (b.proposer === id || b.opponent === id));
  return {
    held: open.filter((t) => t.holder === id).length,
    owed: open.filter((t) => t.owes === id).length,
    w: settled.filter((b) => b.winner === id).length,
    l: settled.filter((b) => b.winner && b.winner !== id).length,
    drank: timers.filter((t) => t.status === "redeemed" && t.owes === id).length,
  };
}

export type Pair = { holder: string; owes: string; items: Anytimer[]; called: Anytimer[] };

export function groupPairs(timers: Anytimer[]): Pair[] {
  const map = new Map<string, Pair>();
  for (const t of unpaid(timers)) {
    const k = `${t.holder}|${t.owes}`;
    if (!map.has(k)) map.set(k, { holder: t.holder, owes: t.owes, items: [], called: [] });
    const p = map.get(k)!;
    p.items.push(t);
    if (t.status === "called") p.called.push(t);
  }
  const pairs = [...map.values()];
  for (const p of pairs) p.items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return pairs.sort((a, b) => b.items.length - a.items.length);
}

export type FeedItem = { at: string; parts: (string | { name: string })[] };

export function feed(members: Member[], bets: Bet[], timers: Anytimer[], limit = 15): FeedItem[] {
  const n = (id: string | null) => ({ name: nameOf(members, id) });
  const out: FeedItem[] = [];
  for (const b of bets) {
    out.push({ at: b.created_at, parts: [n(b.proposer), " challenged ", n(b.opponent), `: ${b.wager}`] });
    if (b.status === "declined" && b.settled_at) out.push({ at: b.settled_at, parts: [n(b.opponent), " passed on a bet from ", n(b.proposer)] });
    if (b.status === "settled" && b.settled_at)
      out.push({ at: b.settled_at, parts: [n(b.winner), " beat ", n(loserOf(b)), ` for ${b.stakes} anytimer${b.stakes === 1 ? "" : "s"}`] });
    if (b.status === "push" && b.settled_at) out.push({ at: b.settled_at, parts: ["Push between ", n(b.proposer), " and ", n(b.opponent), ". Nobody owes."] });
    if (b.status === "void" && b.settled_at) out.push({ at: b.settled_at, parts: ["Bet between ", n(b.proposer), " and ", n(b.opponent), " called off"] });
  }
  for (const t of timers) {
    if (t.called_at && t.status === "called") out.push({ at: t.called_at, parts: [n(t.holder), " called one in on ", n(t.owes)] });
    if (t.redeemed_at) out.push({ at: t.redeemed_at, parts: [n(t.owes), " drank 12 oz for ", n(t.holder)] });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const d = now - t;
  const m = 60_000, h = 60 * m, day = 24 * h;
  if (d < m) return "now";
  if (d < h) return `${Math.floor(d / m)}m ago`;
  if (d < day) return `${Math.floor(d / h)}h ago`;
  if (d < 7 * day) return `${Math.floor(d / day)}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function needsYou(me: string, bets: Bet[], timers: Anytimer[]) {
  const toAccept = bets.filter((b) => b.status === "proposed" && b.opponent === me);
  const toConfirm = bets.filter(
    (b) => b.status === "pending_result" && (b.proposer === me || b.opponent === me) && b.claimed_by !== me,
  );
  const calledOnMe = timers.filter((t) => t.status === "called" && t.owes === me);
  return { toAccept, toConfirm, calledOnMe, count: toAccept.length + toConfirm.length + calledOnMe.length };
}

export function outcomeText(members: Member[], bet: Bet) {
  if (bet.claimed_outcome === "push") return "it was a push";
  if (bet.claimed_outcome === "void") return "the bet is off";
  return `${nameOf(members, bet.claimed_winner)} won`;
}
