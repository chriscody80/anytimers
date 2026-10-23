import webpush from "web-push";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type PushMessage = { title: string; body: string; url: string; tag?: string };

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);
let ready = false;

function setup() {
  if (!ready && pushConfigured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    ready = true;
  }
  return ready;
}

type Target = { endpoint: string; p256dh: string; auth: string };

async function deliver(supabase: Supabase, crewId: string | null, targets: Target[], msg: PushMessage) {
  await Promise.allSettled(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          JSON.stringify(msg),
          { TTL: 60 * 60 * 12, urgency: "high" },
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410: the phone turned notifications off or removed the app.
        if ((code === 404 || code === 410) && crewId) {
          await supabase.rpc("drop_dead_subscription", { p_crew: crewId, p_endpoint: t.endpoint });
        }
      }
    }),
  );
}

/** Notify crewmates. Never throws: a failed notification must not break the action that caused it. */
export async function notifyCrew(supabase: Supabase, crewId: string, userIds: string[], msg: PushMessage) {
  try {
    if (!setup() || userIds.length === 0) return;
    const { data } = await supabase.rpc("push_targets", { p_crew: crewId, p_users: userIds });
    await deliver(supabase, crewId, (data ?? []) as Target[], msg);
  } catch (e) {
    console.error("push failed", e);
  }
}

/** Send to the signed-in person's own devices (the "send a test" button). */
export async function notifySelf(supabase: Supabase, msg: PushMessage) {
  if (!setup()) return 0;
  const { data } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  const targets = (data ?? []) as Target[];
  await deliver(supabase, null, targets, msg);
  return targets.length;
}
