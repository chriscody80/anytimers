import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand, WhoAmI } from "@/components/shell";
import { myCrews, requireUser } from "@/lib/data";

export default async function Home() {
  const { profile } = await requireUser("/");
  const crews = await myCrews();
  if (crews.length === 0) redirect("/start");
  if (crews.length === 1) redirect(`/c/${crews[0].id}`);

  return (
    <main className="wrap">
      <Brand><WhoAmI name={profile.display_name} /></Brand>
      <div className="section">
        <div className="section-head"><h2>Your crews</h2></div>
        <div className="panel list">
          {crews.map((c) => (
            <Link key={c.id} href={`/c/${c.id}`} className="row" style={{ textDecoration: "none" }}>
              <span className="who">{c.name}</span>
            </Link>
          ))}
        </div>
        <div className="actions"><Link className="btn btn-ghost" href="/start">Start or join another crew</Link></div>
      </div>
    </main>
  );
}
