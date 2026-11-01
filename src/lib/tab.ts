import type { Anytimer, Bet, GroupBet, Member } from "./types";

export function nameOf(members: Member[], id: string | null | undefined) {
  return members.find((m) => m.id === id)?.name || "Someone";
}

export function otherParty(bet: Bet, me: string) {
  return bet.proposer === me ? bet.opponent : bet.proposer;
}

export function loserOf(bet: Bet): string | null {
  return bet.winner === bet.proposer ? bet.opponent : bet.proposer;
}

/** Anytimers not yet drunk: outstanding plus called-in. */
export function unpaid(timers: Anytimer[]) {
  return timers.filter((t) => t.status !== "redeemed");
}

export function stats(id: string, bets: Bet[], timers: Anytimer[], groups: GroupBet[] = []) {
  const open = unpaid(timers);
  const settled = bets.filter((b) => b.status === "settled" && (b.proposer === id || b.opponent === id));
  // Group bets count only when someone actually won and someone lost.
  const decided = groups.filter((g) => g.status === "settled" && g.players.some((p) => p.is_loser) && g.players.some((p) => p.is_loser === false));
  const mine = decided.map((g) => g.players.find((p) => p.user_id === id)).filter(Boolean);
  return {
    held: open.filter((t) => t.holder === id).length,
    owed: open.filter((t) => t.owes === id).length,
    w: settled.filter((b) => b.winner === id).length + mine.filter((p) => p!.is_loser === false).length,
    l: settled.filter((b) => b.winner && b.winner !== id).length + mine.filter((p) => p!.is_loser).length,
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

export type FeedItem = { at: string; parts: (string | { name: string })[]; anytimerId?: string };

export function feed(members: Member[], bets: Bet[], timers: Anytimer[], limit = 15, groups: GroupBet[] = []): FeedItem[] {
  const n = (id: string | null) => ({ name: nameOf(members, id) });
  const out: FeedItem[] = [];
  for (const b of bets) {
    if (b.open_to_crew) {
      out.push({ at: b.created_at, parts: [n(b.proposer), ` put a bet out to the crew: ${b.wager}`] });
      if (b.opponent && b.accepted_at) out.push({ at: b.accepted_at, parts: [n(b.opponent), " took ", n(b.proposer), `'s bet: ${b.wager}`] });
      if (!b.opponent && b.status === "void" && b.settled_at) { out.push({ at: b.settled_at, parts: [n(b.proposer), " pulled their bet before anyone took it"] }); continue; }
    } else {
      out.push({ at: b.created_at, parts: [n(b.proposer), " challenged ", n(b.opponent), `: ${b.wager}`] });
    }
    if (b.status === "declined" && b.settled_at) out.push({ at: b.settled_at, parts: [n(b.opponent), " passed on a bet from ", n(b.proposer)] });
    if (b.status === "settled" && b.settled_at)
      out.push({ at: b.settled_at, parts: [n(b.winner), " beat ", n(loserOf(b)), ` for ${b.stakes} anytimer${b.stakes === 1 ? "" : "s"}`] });
    if (b.status === "push" && b.settled_at) out.push({ at: b.settled_at, parts: ["Push between ", n(b.proposer), " and ", n(b.opponent), ". Nobody owes."] });
    if (b.status === "void" && b.settled_at) out.push({ at: b.settled_at, parts: ["Bet between ", n(b.proposer), " and ", n(b.opponent), " called off"] });
  }
  for (const g of groups) {
    out.push({ at: g.created_at, parts: [n(g.creator), ` started a group bet: ${g.title}`] });
    if (g.status === "void" && g.settled_at) out.push({ at: g.settled_at, parts: [`Group bet called off: ${g.title}`] });
    if (g.status === "settled" && g.settled_at) {
      const losers = g.players.filter((p) => p.is_loser).map((p) => p.user_id);
      const winners = g.players.filter((p) => p.is_loser === false).length;
      if (!losers.length || !winners) out.push({ at: g.settled_at, parts: [`Nobody owes on "${g.title}"`] });
      else out.push({ at: g.settled_at, parts: [...joinNames(losers.map((id) => n(id))), ` lost "${g.title}" and owe${losers.length === 1 ? "s" : ""} ${g.stakes} to each of ${winners} winner${winners === 1 ? "" : "s"}`] });
    }
  }
  for (const t of timers) {
    if (t.called_at && t.status === "called") out.push({ at: t.called_at, parts: [n(t.holder), " called one in on ", n(t.owes)] });
    if (t.redeemed_at) out.push({ at: t.redeemed_at, parts: [n(t.owes), " drank 12 oz for ", n(t.holder)], anytimerId: t.id });
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

export function needsYou(me: string, bets: Bet[], timers: Anytimer[], groups: GroupBet[] = []) {
  const toAccept = bets.filter((b) => b.status === "proposed" && b.opponent === me);
  const toConfirm = bets.filter(
    (b) => b.status === "pending_result" && (b.proposer === me || b.opponent === me) && b.claimed_by !== me,
  );
  const calledOnMe = timers.filter((t) => t.status === "called" && t.owes === me);
  const groupsToConfirm = groups.filter(
    (g) => g.status === "pending_result" && g.claimed_by !== me && g.players.some((p) => p.user_id === me),
  );
  return {
    toAccept, toConfirm, calledOnMe, groupsToConfirm,
    count: toAccept.length + toConfirm.length + calledOnMe.length + groupsToConfirm.length,
  };
}

export function outcomeText(members: Member[], bet: Bet) {
  if (bet.claimed_outcome === "push") return "it was a push";
  if (bet.claimed_outcome === "void") return "the bet is off";
  return `${nameOf(members, bet.claimed_winner)} won`;
}

/** Whole-crew bets nobody has taken yet that this person could take. */
export function upForGrabs(me: string, bets: Bet[]) {
  return bets.filter((b) => b.status === "proposed" && b.open_to_crew && !b.opponent && b.proposer !== me);
}

/** The side each person is on. The taker's side falls back to "Against …" when only one side was written. */
export function sideOf(bet: Bet, who: "proposer" | "opponent") {
  if (who === "proposer") return bet.proposer_side;
  return bet.opponent_side ?? (bet.proposer_side ? `Against ${bet.proposer_side}` : null);
}

/** "Chris", "Chris and Mike", "Chris, Mike and Dan" as feed parts. */
function joinNames(names: { name: string }[]): (string | { name: string })[] {
  const out: (string | { name: string })[] = [];
  names.forEach((nm, i) => {
    if (i > 0) out.push(i === names.length - 1 ? " and " : ", ");
    out.push(nm);
  });
  return out;
}

/** Open group bets this person hasn't joined yet. */
export function groupsToJoin(me: string, groups: GroupBet[]) {
  return groups.filter((g) => g.status === "open" && !g.players.some((p) => p.user_id === me));
}

/** What bet an anytimer came from, for "From: …" lines. */
export function sourceTitle(t: Anytimer, bets: Bet[], groups: GroupBet[]) {
  if (t.bet_id) return bets.find((b) => b.id === t.bet_id)?.wager ?? "a bet";
  return groups.find((g) => g.id === t.group_bet_id)?.title ?? "a group bet";
}

/** "Giants won" / "Chris and Mike lost" / "it's off" for a reported group result. */
export function groupClaimText(members: Member[], g: GroupBet) {
  if (g.claimed_outcome === "void") return "it's off";
  if (g.options.length && g.claimed_option != null) return `${g.options[g.claimed_option]} won`;
  const losers = (g.claimed_losers ?? []).map((id) => nameOf(members, id));
  if (!losers.length) return "there's a result";
  const list = losers.length === 1 ? losers[0] : `${losers.slice(0, -1).join(", ")} and ${losers[losers.length - 1]}`;
  return `${list} lost`;
}
