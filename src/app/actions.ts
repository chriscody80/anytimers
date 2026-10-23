"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/tab";
import type { ActionState } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function friendly(message: string) {
  // Messages raised by our database functions are written for people already.
  if (/JWT|auth|session/i.test(message)) return "Your sign-in expired. Reload the page and sign in again.";
  if (/violates check constraint/i.test(message)) return "Something in that form is too long or missing.";
  return message.replace(/^.*?ERROR:\s*/i, "");
}

async function rpc(fn: string, args: Record<string, unknown>, crewId: string, ok: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: friendly(error.message) };
  revalidatePath(`/c/${crewId}`, "layout");
  return { ok };
}

/* ---------- account ---------- */

export async function saveName(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name").replace(/\s+/g, " ");
  if (!name) return { error: "Type a name your friends will recognize." };
  if (name.length > 40) return { error: "Keep it under 40 characters." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your sign-in expired. Sign in again." };
  const { error } = await supabase.from("profiles").update({ display_name: name, onboarded: true }).eq("id", user.id);
  if (error) return { error: friendly(error.message) };
  const next = str(fd, "next");
  if (next) redirect(safeNext(next));
  revalidatePath("/", "layout");
  return { ok: "Name saved" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/* ---------- crews ---------- */

export async function createCrew(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name");
  if (!name) return { error: "Give your crew a name." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_crew", { p_name: name });
  if (error) return { error: friendly(error.message) };
  redirect(`/c/${data}`);
}

export async function joinCrew(_: ActionState, fd: FormData): Promise<ActionState> {
  let code = str(fd, "code");
  const m = code.match(/join\/([a-z0-9]+)/i);
  if (m) code = m[1];
  if (!code) return { error: "Paste the invite link or code." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_crew", { p_code: code });
  if (error) return { error: friendly(error.message) };
  redirect(`/c/${data}`);
}

export async function resetInvite(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc("reset_invite", { p_crew: crew }, crew, "New invite link made. The old one no longer works.");
}

export async function setRules(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc("set_rules", { p_crew: crew, p_rules: String(fd.get("rules") ?? "") }, crew, "Rules saved");
}

/* ---------- bets ---------- */

export async function proposeBet(_: ActionState, fd: FormData): Promise<ActionState> {
  const crew = str(fd, "crew");
  const opponent = str(fd, "opponent");
  const wager = str(fd, "wager");
  const stakes = Math.max(1, Math.min(10, Number(fd.get("stakes")) || 1));
  if (!opponent) return { error: "Pick who you're betting." };
  if (!wager) return { error: "Write what the bet is." };
  if (wager.length > 280) return { error: "Keep the bet under 280 characters." };
  return rpc("propose_bet", { p_crew: crew, p_opponent: opponent, p_wager: wager, p_stakes: stakes }, crew, "Bet sent. They need to accept it.");
}

export async function respondBet(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  const accept = str(fd, "accept") === "1";
  return rpc("respond_bet", { p_bet: str(fd, "bet"), p_accept: accept }, crew, accept ? "You're on" : "Done");
}

export async function claimResult(_: ActionState, fd: FormData): Promise<ActionState> {
  const crew = str(fd, "crew");
  const pick = str(fd, "result");
  if (!pick) return { error: "Pick a result." };
  const outcome = pick === "push" || pick === "void" ? pick : "win";
  return rpc(
    "claim_result",
    { p_bet: str(fd, "bet"), p_outcome: outcome, p_winner: outcome === "win" ? pick : null, p_note: str(fd, "note") },
    crew,
    "Result sent. The other side needs to confirm.",
  );
}

export async function confirmResult(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  const agree = str(fd, "agree") === "1";
  return rpc("confirm_result", { p_bet: str(fd, "bet"), p_agree: agree }, crew, agree ? "Settled" : "Bet reopened");
}

/* ---------- anytimers ---------- */

export async function callAnytimer(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc("call_anytimer", { p_anytimer: str(fd, "anytimer") }, crew, "Called in");
}

export async function cancelCall(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc("cancel_call", { p_anytimer: str(fd, "anytimer") }, crew, "Taken back");
}

export async function markDrank(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc("mark_drank", { p_anytimer: str(fd, "anytimer") }, crew, "Cheers");
}
