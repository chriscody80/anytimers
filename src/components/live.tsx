"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/** Refreshes the page when anyone in the crew changes a bet or an anytimer. */
export function LiveRefresh({ crewId }: { crewId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let t: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(() => router.refresh(), 400);
    };
    const filter = `crew_id=eq.${crewId}`;
    const channel = supabase
      .channel(`crew-${crewId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bets", filter }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "anytimers", filter }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "crew_members", filter }, bump)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crews", filter: `id=eq.${crewId}` }, bump)
      .subscribe();
    const onFocus = () => { if (document.visibilityState === "visible") bump(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onFocus);
      supabase.removeChannel(channel);
    };
  }, [crewId, router]);
  return null;
}

export function TabsNav({ crewId, badge }: { crewId: string; badge: number }) {
  const path = usePathname();
  const base = `/c/${crewId}`;
  const tabs = [
    { href: base, label: "Tab" },
    { href: `${base}/bets`, label: "Bets" },
    { href: `${base}/crew`, label: "Crew" },
    { href: `${base}/rules`, label: "Rules" },
  ];
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            {t.label}
            {t.label === "Tab" && badge > 0 && <span className="badge" aria-label={`${badge} need you`}>{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function CopyInvite({ url }: { url: string }) {
  return (
    <div className="invite">
      <input type="text" readOnly value={url} id="invite-url" aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
      <button
        className="btn btn-primary"
        type="button"
        onClick={async (e) => {
          const btn = e.currentTarget;
          try {
            if (navigator.share) { await navigator.share({ title: "Join my anytimer crew", url }); return; }
            await navigator.clipboard.writeText(url);
            btn.textContent = "Copied";
            setTimeout(() => (btn.textContent = "Share link"), 1800);
          } catch {
            (document.getElementById("invite-url") as HTMLInputElement | null)?.select();
          }
        }}
      >
        Share link
      </button>
    </div>
  );
}
