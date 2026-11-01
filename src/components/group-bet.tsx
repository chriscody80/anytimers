import {
  confirmGroupResult, deleteGroupBet, joinGroupBet, leaveGroupBet, lockGroupBet, voidGroupBet,
} from "@/app/actions";
import { ago, groupClaimText, nameOf } from "@/lib/tab";
import type { GroupBet, Member } from "@/lib/types";
import { ActBtn } from "./forms";
import { ReportGroupResult } from "./group-forms";

const STATUS: Record<GroupBet["status"], { label: string; cls: string }> = {
  open: { label: "Open to join", cls: "grab" },
  locked: { label: "Locked", cls: "open" },
  pending_result: { label: "Waiting on confirm", cls: "wait" },
  settled: { label: "Settled", cls: "" },
  void: { label: "Called off", cls: "" },
};

export function GroupBetCard({
  g, me, members, isAdmin,
}: {
  g: GroupBet; me: string; members: Member[]; isAdmin: boolean;
}) {
  const n = (id: string | null) => (id === me ? "You" : nameOf(members, id));
  const f = { crew: g.crew_id, group: g.id };
  const mine = g.players.find((p) => p.user_id === me);
  const canManage = g.creator === me || isAdmin;
  const active = g.status === "open" || g.status === "locked";
  const settled = g.status === "settled";
  const losers = g.players.filter((p) => p.is_loser);
  const winners = g.players.filter((p) => p.is_loser === false);
  const even = settled ? g.players.filter((p) => p.is_loser == null) : [];
  const myResult = settled && mine ? (mine.is_loser ? "lost" : losers.length && winners.length ? "won" : null) : null;

  let pill = STATUS[g.status];
  if (myResult === "lost") pill = { label: "You lost", cls: "lost" };
  if (myResult === "won") pill = { label: "You won", cls: "won" };

  return (
    <div className="row group">
      <div className="row-main">
        <div className="who">{g.title}</div>
        <span className={`pill ${pill.cls}`}>{pill.label}</span>
      </div>
      <div className="sub">
        Group bet by {n(g.creator)} · {g.players.length} player{g.players.length === 1 ? "" : "s"} · {g.stakes} × 12 oz from each loser to each winner
      </div>

      {g.options.length > 0 ? (
        <div className="opt-board">
          {g.options.map((o, i) => {
            const pickers = g.players.filter((p) => p.pick === i);
            const won = settled && g.winning_option === i;
            const lostOpt = settled && g.winning_option != null && g.winning_option !== i;
            return (
              <div key={i} className={`opt${won ? " opt-won" : ""}${lostOpt ? " opt-lost" : ""}${mine?.pick === i ? " opt-mine" : ""}`}>
                <div className="opt-head">
                  <span className="opt-name">{o}</span>
                  {won && <span className="opt-tag">Winner</span>}
                  {g.status === "open" && mine && mine.pick !== i && (
                    <ActBtn action={joinGroupBet} fields={{ ...f, pick: String(i) }} variant="text">Switch</ActBtn>
                  )}
                  {g.status === "open" && !mine && (
                    <ActBtn action={joinGroupBet} fields={{ ...f, pick: String(i) }} variant="ghost">Pick</ActBtn>
                  )}
                </div>
                <div className="opt-who">
                  {pickers.length ? pickers.map((p) => n(p.user_id)).join(", ") : <span className="sub">Nobody yet</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="players">
          {g.players.map((p) => (
            <span key={p.user_id} className={`player${p.is_loser ? " player-lost" : ""}${settled && p.is_loser === false ? " player-won" : ""}${settled && p.is_loser == null ? " player-even" : ""}`}>
              {n(p.user_id)}
            </span>
          ))}
          {g.players.length === 0 && <span className="sub">Nobody yet</span>}
        </div>
      )}

      {g.status === "pending_result" && (
        <div className="sub wager">
          {n(g.claimed_by)} {g.claimed_by === me ? "say" : "says"} {groupClaimText(members, g)}
          {g.settlement_note ? `: “${g.settlement_note}”` : ""}. {g.claimed_by === me ? "Waiting on someone else in the bet to confirm." : ""}
        </div>
      )}
      {settled && (
        <div className="sub wager">
          {losers.length && winners.length
            ? `${losers.map((p) => n(p.user_id)).join(", ")} ${losers.length === 1 && losers[0].user_id !== me ? "owes" : "owe"} ${g.stakes} to each of ${winners.length} winner${winners.length === 1 ? "" : "s"}`
            : "Nobody owes"}
          {even.length > 0 && g.options.length === 0 ? ` · ${even.map((p) => n(p.user_id)).join(", ")}: no win, no loss` : ""}
          {g.settlement_note ? ` · ${g.settlement_note}` : ""} · {ago(g.settled_at)}
        </div>
      )}

      <div className="actions">
        {g.status === "open" && !mine && g.options.length === 0 && (
          <ActBtn action={joinGroupBet} fields={{ ...f, pick: "" }}>I&apos;m in</ActBtn>
        )}
        {active && (mine || canManage) && (
          <ReportGroupResult crew={g.crew_id} group={g.id} options={g.options}
            players={g.players.map((p) => ({ id: p.user_id, name: nameOf(members, p.user_id) }))} />
        )}
        {g.status === "pending_result" && (mine || isAdmin) && (g.claimed_by !== me || isAdmin) && (
          <>
            <ActBtn action={confirmGroupResult} fields={{ ...f, agree: "1" }}>Confirm</ActBtn>
            {g.claimed_by !== me && <ActBtn action={confirmGroupResult} fields={{ ...f, agree: "0" }} variant="ghost">Dispute</ActBtn>}
          </>
        )}
        {g.status === "pending_result" && g.claimed_by === me && (
          <ActBtn action={confirmGroupResult} fields={{ ...f, agree: "0" }} variant="ghost">Take it back</ActBtn>
        )}
        {g.status === "open" && canManage && g.players.length >= 2 && (
          <ActBtn action={lockGroupBet} fields={f} variant="ghost" confirm="Tap again: no more joining">Lock it</ActBtn>
        )}
        {g.status === "open" && mine && (
          <ActBtn action={leaveGroupBet} fields={f} variant="text">Leave</ActBtn>
        )}
        {(active || g.status === "pending_result") && canManage && (
          <ActBtn action={voidGroupBet} fields={f} variant="text" confirm="Tap again to call it off">Call off</ActBtn>
        )}
      </div>
      {isAdmin && (
        <div className="actions admin-row">
          <ActBtn action={deleteGroupBet} fields={f} variant="text"
            confirm={settled ? "Tap again: deletes it and its anytimers" : "Tap again to delete"}>
            Delete bet
          </ActBtn>
        </div>
      )}
    </div>
  );
}
