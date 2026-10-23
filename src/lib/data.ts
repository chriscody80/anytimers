import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { supabaseConfigured } from "./supabase/env";
import type { Anytimer, Bet, Crew, Member } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Signed-in user with a finished profile, or a redirect to log in / pick a name. */
export async function requireUser(next = "/") {
  if (!supabaseConfigured) redirect("/setup");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from("profiles").select("id, display_name, onboarded").eq("id", user.id).single();
  if (!profile || !profile.onboarded) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  return { supabase, user, profile: profile as { id: string; display_name: string; onboarded: boolean } };
}

export async function myCrews() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("crew_members")
    .select("crew_id, crews(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });
  return (data ?? [])
    .map((r) => (r as unknown as { crews: { id: string; name: string } | null }).crews)
    .filter((c): c is { id: string; name: string } => Boolean(c));
}

export const getCrewData = cache(async function getCrewData(crewId: string) {
  if (!UUID.test(crewId)) notFound();
  const { supabase, user, profile } = await requireUser(`/c/${crewId}`);

  const [crewRes, memberRes, betRes, timerRes] = await Promise.all([
    supabase.from("crews").select("id, name, invite_code, rules, created_by").eq("id", crewId).maybeSingle(),
    supabase.from("crew_members").select("user_id, role, profiles(display_name)").eq("crew_id", crewId),
    supabase.from("bets").select("*").eq("crew_id", crewId).order("created_at", { ascending: false }).limit(500),
    supabase.from("anytimers").select("*").eq("crew_id", crewId).order("created_at", { ascending: true }).limit(2000),
  ]);

  if (!crewRes.data) notFound();

  const members: Member[] = (memberRes.data ?? [])
    .map((r) => {
      const row = r as unknown as { user_id: string; role: "admin" | "member"; profiles: { display_name: string } | null };
      return { id: row.user_id, role: row.role, name: row.profiles?.display_name ?? "Someone" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    me: user.id,
    myName: profile.display_name,
    crew: crewRes.data as Crew,
    members,
    bets: (betRes.data ?? []) as Bet[],
    timers: (timerRes.data ?? []) as Anytimer[],
  };
});
