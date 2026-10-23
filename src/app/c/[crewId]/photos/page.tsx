import { DeletePhoto, PhotoUpload } from "@/components/photos";
import { getCrewData } from "@/lib/data";
import { ago, nameOf } from "@/lib/tab";

export default async function PhotosPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { me, crew, members, bets, timers, photos } = await getCrewData(crewId);
  const n = (id: string | null) => nameOf(members, id);
  const byTimer = new Map(timers.map((t) => [t.id, t]));
  const countFor = (id: string) => photos.filter((p) => p.anytimer_id === id).length;

  // Your paid anytimers that could still use a photo (newest first).
  const canAdd = timers
    .filter((t) => t.status === "redeemed" && (t.holder === me || t.owes === me) && countFor(t.id) < 4)
    .sort((a, b) => (b.redeemed_at ?? "").localeCompare(a.redeemed_at ?? ""))
    .slice(0, 8);

  return (
    <section className="view">
      <div className="section">
        <div className="section-head"><h2>Add proof</h2></div>
        <div className="panel list">
          {canAdd.length === 0 && (
            <div className="empty"><strong>Nothing to add yet</strong>Once you give or drink an anytimer, you can add a photo of it here.</div>
          )}
          {canAdd.map((t) => (
            <div className="row" key={t.id}>
              <div className="row-main">
                <div className="who">{n(t.owes)}<span className="arrow">drank for</span>{n(t.holder)}</div>
                <span className="sub">{ago(t.redeemed_at)}</span>
              </div>
              <div className="sub wager">From: {bets.find((b) => b.id === t.bet_id)?.wager ?? "a bet"}{countFor(t.id) ? ` · ${countFor(t.id)} photo${countFor(t.id) === 1 ? "" : "s"}` : ""}</div>
              <div className="actions"><PhotoUpload crewId={crew.id} anytimerId={t.id} label={countFor(t.id) ? "Add another" : "Add photo"} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>The wall</h2>{photos.length > 0 && <span className="count">{photos.length}</span>}</div>
        {photos.length === 0 ? (
          <div className="panel"><div className="empty"><strong>No photos yet</strong>Proof of every 12 oz shows up here.</div></div>
        ) : (
          <div className="gallery">
            {photos.map((p) => {
              const t = byTimer.get(p.anytimer_id);
              return (
                <figure className="panel shot" key={p.id}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={t ? `${n(t.owes)} drinking for ${n(t.holder)}` : "Drink photo"} loading="lazy" /></a>
                  ) : (
                    <div className="shot-missing">Photo unavailable</div>
                  )}
                  <figcaption>
                    {t && <span className="who">{n(t.owes)}<span className="arrow">for</span>{n(t.holder)}</span>}
                    <span className="sub">{ago(p.created_at)}</span>
                    {p.uploaded_by === me && <DeletePhoto crewId={crew.id} photoId={p.id} path={p.path} />}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
