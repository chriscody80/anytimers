import Link from "next/link";
import { Brand, WhoAmI } from "@/components/shell";
import { myCrews, requireUser } from "@/lib/data";

export default async function CrewsPage() {
  const { profile } = await requireUser("/crews");
  const crews = await myCrews();

  return (
    <main className="wrap narrow">
      <Brand><WhoAmI name={profile.display_name} /></Brand>
      <div className="section">
        <div className="section-head"><h2>Your crews</h2><span className="count">{crews.length || ""}</span></div>
        <div className="panel list">
          {crews.length === 0 && <div className="empty"><strong>No crews yet</strong>Start one or join a friend&apos;s below.</div>}
          {crews.map((c) => (
            <Link key={c.id} href={`/c/${c.id}`} className="row" style={{ textDecoration: "none" }}>
              <span className="row-main"><span className="who">{c.name}</span><span className="sub">Open →</span></span>
            </Link>
          ))}
        </div>
        <div className="actions"><Link className="btn btn-primary" href="/start">Start or join a crew</Link></div>
      </div>
    </main>
  );
}
