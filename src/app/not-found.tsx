import Link from "next/link";
import { Brand } from "@/components/shell";

export default function NotFound() {
  return (
    <main className="wrap narrow">
      <Brand />
      <div className="panel hero">
        <h2>Nothing here</h2>
        <p>This page doesn&apos;t exist, or it belongs to a crew you&apos;re not in. If a friend sent you a link, ask them for the crew&apos;s invite link instead.</p>
        <div className="actions"><Link className="btn btn-primary" href="/">Go to your crews</Link></div>
      </div>
    </main>
  );
}
