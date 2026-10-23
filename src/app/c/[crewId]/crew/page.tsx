import { headers } from "next/headers";
import { resetInvite, saveName } from "@/app/actions";
import { ActBtn, ActionForm, SubmitButton } from "@/components/forms";
import { CopyInvite } from "@/components/live";
import { NotifySettings } from "@/components/notify";
import { getCrewData } from "@/lib/data";
import { stats } from "@/lib/tab";

export default async function CrewPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const { me, myName, crew, members, bets, timers } = await getCrewData(crewId);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const inviteUrl = `${proto}://${host}/join/${crew.invite_code}`;
  const isAdmin = members.find((m) => m.id === me)?.role === "admin";

  return (
    <section className="view">
      <div className="section">
        <div className="section-head"><h2>Invite friends</h2></div>
        <div className="panel form">
          <p className="sub">Anyone with this link can join {crew.name} after they sign in.</p>
          <CopyInvite url={inviteUrl} />
          {isAdmin && (
            <div className="actions">
              <ActBtn action={resetInvite} fields={{ crew: crew.id }} variant="text" confirm="Tap again: the old link stops working">Make a new link</ActBtn>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>The crew</h2><span className="count">{members.length}</span></div>
        <div className="panel list">
          {members.map((m) => {
            const s = stats(m.id, bets, timers);
            return (
              <div className="row" key={m.id}>
                <div className="row-main">
                  <div className="who">{m.name}{m.id === me && <span className="sub"> (you)</span>}{m.role === "admin" && <span className="sub"> · admin</span>}</div>
                  <span className="sub">Holds {s.held} · Owes {s.owed} · {s.w}–{s.l}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>Notifications</h2></div>
        <NotifySettings />
      </div>

      <div className="section">
        <div className="section-head"><h2>Your name</h2></div>
        <ActionForm action={saveName}>
          <div className="field">
            <label className="label" htmlFor="name">Shown on the tab as</label>
            <input id="name" name="name" type="text" maxLength={40} defaultValue={myName} />
          </div>
          <div className="actions"><SubmitButton variant="ghost">Save name</SubmitButton></div>
        </ActionForm>
      </div>
    </section>
  );
}
