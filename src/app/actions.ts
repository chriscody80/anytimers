"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyCrew, notifySelf, pushConfigured, type PushMessage } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { outcomeText, safeNext } from "@/lib/tab";
import type { ActionState, Anytimer, Bet, Member } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const clip = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function friendly(message: string) {
  // Messages raised by our database functions are written for people already.
  if (/JWT|auth|session/i.test(message)) return "Your sign-in expired. Reload the page and sign in again.";
  if (/violates check constraint/i.test(message)) return "Something in that form is too long or missing.";
  return message.replace(/^.*?ERROR:\s*/i, "");
}

/* ---------- notification helpers ---------- */

/** Who's who in a crew, for writing notification text. */
async function crewNames(supabase: Supabase, crewId: string) {
  const [{ data: { user } }, { data: rows }, { data: crew }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("crew_members").select("user_id, role, profiles(display_name)").eq("crew_id", crewId),
    supabase.from("crews").select("name").eq("id", crewId).maybeSingle(),
  ]);
  const members: Member[] = (rows ?? []).map((r) => {
    const row = r as unknown as { user_id: string; role: "admin" | "member"; profiles: { display_name: string } | null };
    return { id: row.user_id, role: row.role, name: row.profiles?.display_name ?? "Someone" };
  });
  const name = (id: string | null | undefined) => members.find((m) => m.id === id)?.name || "Someone";
  return { me: user?.id ?? "", meName: name(user?.id), name, members, crewName: (crew?.name as string) ?? "your crew" };
}

/** Runs after the response is sent, so notifications never slow down a tap. */
function later(fn: () => Promise<void>) {
  if (!pushConfigured) return;
  after(async () => {
    try { await fn(); } catch (e) { console.error("notification step failed", e); }
  });
}

async function getBet(supabase: Supabase, id: string) {
  const { data } = await supabase.from("bets").select("*").eq("id", id).maybeSingle();
  return data as Bet | null;
}

async function getAnytimer(supabase: Supabase, id: string) {
  const { data } = await supabase.from("anytimers").select("*").eq("id", id).maybeSingle();
  return data as Anytimer | null;
}

async function rpc(
  supabase: Supabase, fn: string, args: Record<string, unknown>, crewId: string, ok: string,
  notify?: (data: unknown) => Promise<void>,
): Promise<ActionState> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { error: friendly(error.message) };
  if (notify) later(() => notify(data));
  revalidatePath(`/c/${crewId}`, "layout");
  return { ok };
}

const send = (supabase: Supabase, crewId: string, to: string[], msg: PushMessage) => notifyCrew(supabase, crewId, to, msg);

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
  const crewId = data as string;
  later(async () => {
    const c = await crewNames(supabase, crewId);
    await send(supabase, crewId, c.members.map((x) => x.id).filter((id) => id !== c.me), {
      title: `${c.meName} joined ${c.crewName}`, body: "Time to make some bets.", url: `/c/${crewId}`,
    });
  });
  redirect(`/c/${crewId}`);
}

export async function resetInvite(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc(await createClient(), "reset_invite", { p_crew: crew }, crew, "New invite link made. The old one no longer works.");
}

export async function setRules(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc(await createClient(), "set_rules", { p_crew: crew, p_rules: String(fd.get("rules") ?? "") }, crew, "Rules saved");
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
  const supabase = await createClient();
  return rpc(supabase, "propose_bet", { p_crew: crew, p_opponent: opponent, p_wager: wager, p_stakes: stakes }, crew,
    "Bet sent. They need to accept it.",
    async (betId) => {
      const c = await crewNames(supabase, crew);
      await send(supabase, crew, [opponent], {
        title: `${c.meName} challenged you`, body: `${clip(wager)} · ${stakes} × 12 oz`, url: `/c/${crew}`, tag: `bet-${betId}`,
      });
    });
}

export async function respondBet(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  const betId = str(fd, "bet");
  const accept = str(fd, "accept") === "1";
  const supabase = await createClient();
  return rpc(supabase, "respond_bet", { p_bet: betId, p_accept: accept }, crew, accept ? "You're on" : "Done", async () => {
    const [b, c] = await Promise.all([getBet(supabase, betId), crewNames(supabase, crew)]);
    if (!b) return;
    const msg = { body: clip(b.wager), url: `/c/${crew}/bets`, tag: `bet-${b.id}` };
    if (accept) await send(supabase, crew, [b.proposer], { title: `${c.meName} accepted your bet`, ...msg });
    else if (c.me === b.opponent) await send(supabase, crew, [b.proposer], { title: `${c.meName} passed on your bet`, ...msg });
    else await send(supabase, crew, [b.opponent], { title: `${c.meName} withdrew their bet`, ...msg });
  });
}

export async function claimResult(_: ActionState, fd: FormData): Promise<ActionState> {
  const crew = str(fd, "crew");
  const betId = str(fd, "bet");
  const pick = str(fd, "result");
  if (!pick) return { error: "Pick a result." };
  const outcome = pick === "push" || pick === "void" ? pick : "win";
  const supabase = await createClient();
  return rpc(supabase, "claim_result",
    { p_bet: betId, p_outcome: outcome, p_winner: outcome === "win" ? pick : null, p_note: str(fd, "note") },
    crew, "Result sent. The other side needs to confirm.",
    async () => {
      const [b, c] = await Promise.all([getBet(supabase, betId), crewNames(supabase, crew)]);
      if (!b) return;
      const other = b.proposer === c.me ? b.opponent : b.proposer;
      await send(supabase, crew, [other], {
        title: `${c.meName} says ${outcomeText(c.members, b)}`, body: `Confirm or dispute: ${clip(b.wager)}`, url: `/c/${crew}`, tag: `bet-${b.id}`,
      });
    });
}

export async function confirmResult(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  const betId = str(fd, "bet");
  const agree = str(fd, "agree") === "1";
  const supabase = await createClient();
  const before = await getBet(supabase, betId); // the claim is cleared by a dispute, so read it first
  return rpc(supabase, "confirm_result", { p_bet: betId, p_agree: agree }, crew, agree ? "Settled" : "Bet reopened", async () => {
    if (!before?.claimed_by) return;
    const c = await crewNames(supabase, crew);
    if (c.me === before.claimed_by) return; // took back their own report
    const tag = `bet-${before.id}`;
    if (!agree) {
      await send(supabase, crew, [before.claimed_by], { title: `${c.meName} disputed the result`, body: clip(before.wager), url: `/c/${crew}/bets`, tag });
      return;
    }
    const body =
      before.claimed_outcome === "win"
        ? `${c.name(before.claimed_winner)} won ${before.stakes} × 12 oz: ${clip(before.wager, 80)}`
        : before.claimed_outcome === "push" ? `Push. Nobody owes: ${clip(before.wager, 80)}` : `Called off: ${clip(before.wager, 80)}`;
    await send(supabase, crew, [before.claimed_by], { title: `${c.meName} confirmed. Bet settled.`, body, url: `/c/${crew}`, tag });
  });
}

/* ---------- anytimers ---------- */

export async function callAnytimer(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  const id = str(fd, "anytimer");
  const supabase = await createClient();
  return rpc(supabase, "call_anytimer", { p_anytimer: id }, crew, "Called in", async () => {
    const [a, c] = await Promise.all([getAnytimer(supabase, id), crewNames(supabase, crew)]);
    if (!a) return;
    await send(supabase, crew, [a.owes], {
      title: `${c.meName} called an anytimer on you`, body: "Drink a 12 oz, then tap Done in the app.", url: `/c/${crew}`, tag: `at-${id}`,
    });
  });
}

export async function cancelCall(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  return rpc(await createClient(), "cancel_call", { p_anytimer: str(fd, "anytimer") }, crew, "Taken back");
}

export async function markDrank(_: ActionState, fd: FormData) {
  const crew = str(fd, "crew");
  const id = str(fd, "anytimer");
  const supabase = await createClient();
  return rpc(supabase, "mark_drank", { p_anytimer: id }, crew, "Cheers", async () => {
    const [a, c] = await Promise.all([getAnytimer(supabase, id), crewNames(supabase, crew)]);
    if (!a) return;
    if (c.me === a.owes) {
      await send(supabase, crew, [a.holder], { title: `${c.meName} drank it`, body: "Anytimer paid. Add a photo for proof.", url: `/c/${crew}/photos`, tag: `at-${id}` });
    } else {
      await send(supabase, crew, [a.owes], { title: `${c.meName} marked your anytimer as paid`, body: "One less on your tab.", url: `/c/${crew}`, tag: `at-${id}` });
    }
  });
}

/* ---------- photos ---------- */

export async function addPhotoRecord(crew: string, anytimer: string, path: string): Promise<ActionState> {
  const supabase = await createClient();
  return rpc(supabase, "add_drink_photo", { p_anytimer: anytimer, p_path: path }, crew, "Photo added", async () => {
    const [a, c] = await Promise.all([getAnytimer(supabase, anytimer), crewNames(supabase, crew)]);
    if (!a) return;
    const other = a.holder === c.me ? a.owes : a.holder;
    await send(supabase, crew, [other], { title: `${c.meName} added a photo`, body: "Proof of a 12 oz is on the wall.", url: `/c/${crew}/photos`, tag: `photo-${anytimer}` });
  });
}

export async function deletePhotoRecord(crew: string, photo: string): Promise<ActionState> {
  return rpc(await createClient(), "delete_drink_photo", { p_photo: photo }, crew, "Photo removed");
}

/* ---------- notifications ---------- */

export async function savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
  return error ? { error: friendly(error.message) } : { ok: "Notifications are on" };
}

export async function removePushSubscription(endpoint: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_push_subscription", { p_endpoint: endpoint });
  return error ? { error: friendly(error.message) } : { ok: "Notifications are off" };
}

export async function sendTestPush(): Promise<ActionState> {
  if (!pushConfigured) return { error: "Notifications aren't set up on the server yet (missing VAPID keys in Vercel)." };
  const supabase = await createClient();
  const count = await notifySelf(supabase, { title: "Anytimer Tab", body: "Notifications work. Cheers 🍺", url: "/", tag: "test" });
  return count ? { ok: "Sent. It should pop up in a few seconds." } : { error: "This device isn't registered yet. Turn notifications on first." };
}
