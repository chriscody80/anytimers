import { confirmResult, deleteBet, proposeBet, respondBet } from "@/app/actions";
import { ActBtn, ActionForm, Stepper, SubmitButton } from "@/components/forms";
import { ReportResult } from "@/components/report-result";
import { getCrewData } from "@/lib/data";
import { ago, loserOf, nameOf, otherParty, outcomeText } from "@/lib/tab";
import type { Bet } from "@/lib/types";

export default async function BetsPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { me, crew, members, bets } = await getCrewData(crewId);
  const n = (id: string | null) => nameOf(members, id);
  const f = { crew: crew.id };
  const others = members.filter((m) => m.id !== me);
  const isAdmin = members.find((m) => m.id === me)?.role === "admin";
  const adminDelete = (b: Bet) =>
    isAdmin ? (
      <div className="actions admin-row">
        <ActBtn action={deleteBet} fields={{ ...f, bet: b.id }} variant="text"
          confirm={b.status === "settled" ? "Tap again: deletes the bet and its anytimers" : "Tap again to delete"}>
          Delete bet
        </ActBtn>
      </div>
    ) : null;

  const proposed = bets.filter((b) => b.status === "proposed");
  const live = bets.filter((b) => b.status === "open" || b.status === "pending_result");
  const done = bets
    .filter((b) => ["settled", "push", "void", "declined"].includes(b.status))
    .sort((a, b) => (b.settled_at ?? "").localeCompare(a.settled_at ?? ""));

  const head = (b: Bet) => (
    <div className="who">
      {n(b.proposer)}{b.proposer === me && <span className="sub"> (you)</span>}
      <span className="arrow">vs</span>
      {n(b.opponent)}{b.opponent === me && <span className="sub"> (you)</span>}
    </div>
  );

  return (
    <section className="view">
      <div className="section">
        <div className="section-head"><h2>New bet</h2></div>
        {others.length === 0 ? (
          <p className="notice">Invite someone on the Crew tab first. You need at least one other person to bet.</p>
        ) : (
          <ActionForm action={proposeBet} fields={f} resetOnOk>
            <div className="field">
              <label className="label" htmlFor="opponent">You vs</label>
              <select id="opponent" name="opponent" defaultValue="">
                <option value="" disabled>Pick a friend</option>
                {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="wager">What&apos;s the bet?</label>
              <textarea id="wager" name="wager" rows={2} maxLength={280} placeholder="Giants cover the spread on Sunday" />
            </div>
            <Stepper name="stakes" label="Anytimers to the winner" />
            <div className="actions"><SubmitButton>Send bet</SubmitButton></div>
          </ActionForm>
        )}
      </div>

      {proposed.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Waiting to be accepted</h2><span className="count">{proposed.length}</span></div>
          <div className="panel list">
            {proposed.map((b) => (
              <div className="row" key={b.id}>
                <div className="row-main">{head(b)}<span className="pill wait">{b.stakes} × 12 oz</span></div>
                <div className="wager">{b.wager}</div>
                <div className="sub">Sent {ago(b.created_at)} · waiting on {n(b.opponent)}</div>
                {b.opponent === me && (
                  <div className="actions">
                    <ActBtn action={respondBet} fields={{ ...f, bet: b.id, accept: "1" }}>Accept</ActBtn>
                    <ActBtn action={respondBet} fields={{ ...f, bet: b.id, accept: "0" }} variant="ghost">Pass</ActBtn>
                  </div>
                )}
                {b.proposer === me && (
                  <div className="actions">
                    <ActBtn action={respondBet} fields={{ ...f, bet: b.id, accept: "0" }} variant="text" confirm="Tap again to withdraw">Withdraw</ActBtn>
                  </div>
                )}
                {adminDelete(b)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Live bets</h2>{live.length > 0 && <span className="count">{live.length}</span>}</div>
        <div className="panel list">
          {live.length === 0 && <div className="empty"><strong>No live bets</strong>Once someone accepts a bet, it shows up here until it&apos;s settled.</div>}
          {live.map((b) => {
            const inIt = b.proposer === me || b.opponent === me;
            const pending = b.status === "pending_result";
            return (
              <div className="row" key={b.id}>
                <div className="row-main">{head(b)}<span className="pill open">{b.stakes} × 12 oz</span></div>
                <div className="wager">{b.wager}</div>
                <div className="sub">Accepted {ago(b.accepted_at)}</div>
                {pending && (
                  <div className="sub wager">
                    {n(b.claimed_by)} says {outcomeText(members, b)}{b.settlement_note ? `: “${b.settlement_note}”` : ""}.
                    {b.claimed_by === me ? ` Waiting on ${n(otherParty(b, me))} to confirm.` : inIt ? "" : ` Waiting on ${n(otherParty(b, b.claimed_by!))}.`}
                  </div>
                )}
                {inIt && !pending && (
                  <ReportResult
                    crew={crew.id}
                    bet={b.id}
                    options={[
                      { value: b.proposer, label: `${n(b.proposer)} won` },
                      { value: b.opponent, label: `${n(b.opponent)} won` },
                      { value: "push", label: "Push" },
                      { value: "void", label: "Call it off" },
                    ]}
                  />
                )}
                {inIt && pending && b.claimed_by !== me && (
                  <div className="actions">
                    <ActBtn action={confirmResult} fields={{ ...f, bet: b.id, agree: "1" }}>Confirm</ActBtn>
                    <ActBtn action={confirmResult} fields={{ ...f, bet: b.id, agree: "0" }} variant="ghost">Dispute</ActBtn>
                  </div>
                )}
                {inIt && pending && b.claimed_by === me && (
                  <div className="actions">
                    <ActBtn action={confirmResult} fields={{ ...f, bet: b.id, agree: "0" }} variant="ghost">Take it back</ActBtn>
                  </div>
                )}
                {adminDelete(b)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Settled</h2>{done.length > 0 && <span className="count">{done.length}</span>}</div>
        <div className="panel list">
          {done.length === 0 && <div className="empty">Settled bets and how they were decided land here.</div>}
          {done.map((b) => {
            let pill, line;
            if (b.status === "settled") {
              pill = <span className={`pill ${loserOf(b) === me ? "lost" : "won"}`}>{n(b.winner)} won</span>;
              line = `${n(loserOf(b))} owes ${b.stakes} × 12 oz`;
            } else if (b.status === "push") { pill = <span className="pill">Push</span>; line = "Nobody owes"; }
            else if (b.status === "declined") { pill = <span className="pill">Passed</span>; line = `${n(b.opponent)} didn't take it`; }
            else { pill = <span className="pill">Called off</span>; line = "Nobody owes"; }
            return (
              <div className="row" key={b.id}>
                <div className="row-main">{head(b)}{pill}</div>
                <div className="wager">{b.wager}</div>
                {b.settlement_note && <div className="sub wager">Settled: {b.settlement_note}</div>}
                <div className="sub">{line} · {ago(b.settled_at)}</div>
                {adminDelete(b)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
