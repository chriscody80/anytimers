import Link from "next/link";
import { callAnytimer, cancelCall, confirmResult, markDrank, respondBet } from "@/app/actions";
import { ActBtn } from "@/components/forms";
import { NotifyBanner } from "@/components/notify";
import { PhotoUpload } from "@/components/photos";
import { Chips } from "@/components/shell";
import { getCrewData } from "@/lib/data";
import { ago, feed, groupPairs, nameOf, needsYou, outcomeText, stats } from "@/lib/tab";

export default async function TabPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { me, crew, members, bets, timers, photos } = await getCrewData(crewId);
  const n = (id: string | null) => nameOf(members, id);
  const inbox = needsYou(me, bets, timers);
  const mine = stats(me, bets, timers);
  const pairs = groupPairs(timers);
  const events = feed(members, bets, timers);
  const f = { crew: crew.id };
  const photosFor = (id?: string) => (id ? photos.filter((p) => p.anytimer_id === id && p.url) : []);
  // Drinks in the last two days that you were part of and nobody has photographed yet.
  const recent = Date.now() - 48 * 3600_000;
  const needsProof = timers
    .filter((t) => t.status === "redeemed" && (t.holder === me || t.owes === me) && t.redeemed_at && new Date(t.redeemed_at).getTime() > recent)
    .filter((t) => photosFor(t.id).length === 0)
    .slice(-3)
    .reverse();

  return (
    <section className="view">
      <NotifyBanner />
      {inbox.count > 0 && (
        <div className="section">
          <div className="section-head"><h2>Needs you</h2><span className="count">{inbox.count}</span></div>
          <div className="panel list attn">
            {inbox.calledOnMe.map((t) => (
              <div className="row" key={t.id}>
                <div className="row-main"><div className="who">{n(t.holder)} called one in on you</div><Chips total={1} called={1} /></div>
                <div className="sub wager">From: {bets.find((b) => b.id === t.bet_id)?.wager ?? "a bet"} · {ago(t.called_at)}</div>
                <div className="actions"><ActBtn action={markDrank} fields={{ ...f, anytimer: t.id }}>Done, I drank it</ActBtn></div>
              </div>
            ))}
            {inbox.toAccept.map((b) => (
              <div className="row" key={b.id}>
                <div className="row-main"><div className="who">{n(b.proposer)} wants to bet you</div><span className="pill open">{b.stakes} × 12 oz</span></div>
                <div className="wager">{b.wager}</div>
                <div className="actions">
                  <ActBtn action={respondBet} fields={{ ...f, bet: b.id, accept: "1" }}>Accept</ActBtn>
                  <ActBtn action={respondBet} fields={{ ...f, bet: b.id, accept: "0" }} variant="ghost">Pass</ActBtn>
                </div>
              </div>
            ))}
            {inbox.toConfirm.map((b) => (
              <div className="row" key={b.id}>
                <div className="row-main"><div className="who">{n(b.claimed_by)} says {outcomeText(members, b)}</div><span className="pill open">{b.stakes} × 12 oz</span></div>
                <div className="wager">{b.wager}</div>
                {b.settlement_note && <div className="sub wager">&ldquo;{b.settlement_note}&rdquo;</div>}
                <div className="actions">
                  <ActBtn action={confirmResult} fields={{ ...f, bet: b.id, agree: "1" }}>Confirm</ActBtn>
                  <ActBtn action={confirmResult} fields={{ ...f, bet: b.id, agree: "0" }} variant="ghost">Dispute</ActBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="you">
        <div className="panel stat hold"><span className="label">You hold</span><span className="n">{mine.held}</span><span className="sub">anytimer{mine.held === 1 ? "" : "s"}</span></div>
        <div className="panel stat owe"><span className="label">You owe</span><span className="n">{mine.owed}</span><span className="sub">{mine.owed * 12} oz total</span></div>
      </div>

      {needsProof.length > 0 && (
        <div className="section">
          <div className="section-head"><h2>Got proof?</h2></div>
          <div className="panel list">
            {needsProof.map((t) => (
              <div className="row" key={t.id}>
                <div className="row-main">
                  <div className="who">{n(t.owes)}<span className="arrow">drank for</span>{n(t.holder)}</div>
                  <span className="sub">{ago(t.redeemed_at)}</span>
                </div>
                <div className="actions"><PhotoUpload crewId={crew.id} anytimerId={t.id} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h2>Who&apos;s got what</h2>{pairs.length > 0 && <span className="count">{pairs.reduce((s, p) => s + p.items.length, 0)} unpaid</span>}</div>
        <div className="panel list">
          {pairs.length === 0 && (
            <div className="empty">
              <strong>No anytimers outstanding</strong>
              {bets.length ? "Everything has been drunk. Time for a new bet." : <>Settle a bet and the winner&apos;s anytimers show up here. <Link href={`/c/${crew.id}/bets`}>Make a bet</Link>.</>}
            </div>
          )}
          {pairs.map((p) => {
            const next = p.items.find((t) => t.status === "outstanding");
            const waiting = p.called[0];
            return (
              <div className="row" key={`${p.holder}|${p.owes}`}>
                <div className="row-main">
                  <div className="who">
                    {n(p.holder)}{p.holder === me && <span className="sub"> (you)</span>}
                    <span className="arrow">has</span>
                    {n(p.owes)}{p.owes === me && <span className="sub"> (you)</span>}
                  </div>
                  <Chips total={p.items.length} called={p.called.length} />
                </div>
                {waiting && <div className="sub">Called in {ago(waiting.called_at)}. Waiting on {n(p.owes)} to drink it.</div>}
                {p.holder === me && (
                  <div className="actions">
                    {waiting ? (
                      <>
                        <ActBtn action={markDrank} fields={{ ...f, anytimer: waiting.id }}>They drank it</ActBtn>
                        <ActBtn action={cancelCall} fields={{ ...f, anytimer: waiting.id }} variant="ghost">Take it back</ActBtn>
                      </>
                    ) : next ? (
                      <ActBtn action={callAnytimer} fields={{ ...f, anytimer: next.id }} confirm={`Call it on ${n(p.owes)}?`}>Call one in</ActBtn>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Standings</h2></div>
        <div className="panel tablewrap">
          <table>
            <thead><tr><th>Name</th><th>Holds</th><th>Owes</th><th>W–L</th><th>Drank</th></tr></thead>
            <tbody>
              {members
                .map((m) => ({ m, s: stats(m.id, bets, timers) }))
                .sort((a, b) => (b.s.held - b.s.owed) - (a.s.held - a.s.owed) || b.s.w - a.s.w || a.m.name.localeCompare(b.m.name))
                .map(({ m, s }) => (
                  <tr key={m.id}>
                    <td>{m.name}{m.id === me && <span className="mine">you</span>}</td>
                    <td className="num">{s.held}</td>
                    <td className="num">{s.owed}</td>
                    <td className="num">{s.w}–{s.l}</td>
                    <td className="num">{s.drank * 12} oz</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {members.length < 2 && <p className="notice">It&apos;s just you so far. <Link href={`/c/${crew.id}/crew`}>Invite your friends</Link>.</p>}
      </div>

      <div className="section">
        <div className="section-head"><h2>Recent</h2></div>
        <div className="panel">
          {events.length === 0 ? (
            <div className="empty">Bets, wins and drinks show up here as they happen.</div>
          ) : (
            <ul className="feed">
              {events.map((e, i) => (
                <li key={i}>
                  <time dateTime={e.at}>{ago(e.at)}</time>
                  <span className="feed-body">
                    <span>{e.parts.map((p, j) => (typeof p === "string" ? <span key={j}>{p}</span> : <strong key={j}>{p.name}</strong>))}</span>
                    {photosFor(e.anytimerId).length > 0 && (
                      <Link href={`/c/${crew.id}/photos`} className="thumbs" aria-label="See photos">
                        {photosFor(e.anytimerId).slice(0, 3).map((ph) => <img key={ph.id} src={ph.url!} alt="" loading="lazy" />)}
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
