import Link from "next/link";
import { LiveRefresh, TabsNav } from "@/components/live";
import { Brand, WhoAmI } from "@/components/shell";
import { getCrewData } from "@/lib/data";
import { needsYou } from "@/lib/tab";

export default async function CrewLayout({ children, params }: { children: React.ReactNode; params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const d = await getCrewData(crewId);
  const badge = needsYou(d.me, d.bets, d.timers).count;
  return (
    <main className="wrap">
      <Brand tagline={d.crew.name}>
        <WhoAmI name={d.myName} extra={<Link className="linkish" href="/crews">Crews</Link>} />
      </Brand>
      <TabsNav crewId={crewId} badge={badge} />
      <LiveRefresh crewId={crewId} />
      {children}
    </main>
  );
}
