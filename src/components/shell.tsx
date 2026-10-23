import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";

export function Chips({ total, called = 0 }: { total: number; called?: number }) {
  const show = Math.min(total, 5);
  return (
    <span className="chips" aria-label={`${total} anytimer${total === 1 ? "" : "s"}${called ? `, ${called} called in` : ""}`}>
      {Array.from({ length: show }, (_, i) => (
        <span key={i} className={`chip${i < called ? " called" : ""}`} aria-hidden="true">12oz</span>
      ))}
      {total > show && <span className="chip-more">+{total - show}</span>}
    </span>
  );
}

export function Brand({ tagline = "Every bet, and every 12 oz still owed.", children }: { tagline?: string; children?: ReactNode }) {
  return (
    <header className="top">
      <div className="brand">
        <h1><Link href="/">Anytimer <span>Tab</span></Link></h1>
        <p>{tagline}</p>
      </div>
      {children}
    </header>
  );
}

export function WhoAmI({ name, extra }: { name: string; extra?: ReactNode }) {
  return (
    <div className="who-am-i">
      <span>Signed in as <strong>{name}</strong></span>
      <span className="actions">
        {extra}
        <form action={signOut}><button className="linkish" type="submit">Sign out</button></form>
      </span>
    </div>
  );
}
