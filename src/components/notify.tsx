"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DISMISS_KEY = "anytimers.notify-banner-dismissed";

type State = "checking" | "needs-home-screen" | "unsupported" | "not-configured" | "off" | "on" | "denied";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function usePush() {
  const [state, setState] = useState<State>("checking");
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        setState(isIOS() && !isStandalone() ? "needs-home-screen" : "unsupported");
        return;
      }
      if (!VAPID_PUBLIC) { setState("not-configured"); return; }
      try {
        const r = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        if (cancelled) return;
        setReg(r);
        if (Notification.permission === "denied") { setState("denied"); return; }
        const sub = await r.pushManager.getSubscription();
        if (sub && Notification.permission === "granted") {
          const j = sub.toJSON();
          // Re-save quietly so the server always has this device (e.g. after signing in as someone else).
          if (j.endpoint && j.keys) savePushSubscription(j.endpoint, j.keys.p256dh, j.keys.auth);
          setState("on");
        } else {
          setState("off");
        }
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setMsg(null);
    // iPhone only shows the prompt if this is the first thing a tap does.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
    setBusy(true);
    try {
      const r = reg ?? (await navigator.serviceWorker.ready);
      const sub = (await r.pushManager.getSubscription()) ??
        (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) }));
      const j = sub.toJSON();
      if (!j.endpoint || !j.keys) throw new Error("no keys");
      const res = await savePushSubscription(j.endpoint, j.keys.p256dh, j.keys.auth);
      if (res?.error) { setMsg(res); return; }
      setState("on");
      setMsg({ ok: "Notifications are on. Send a test to check." });
    } catch {
      setMsg({ error: "Couldn't turn notifications on. Close the app fully, reopen it, and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setState("off");
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg(null);
    try { setMsg(await sendTestPush()); } finally { setBusy(false); }
  }

  return { state, msg, busy, enable, disable, test };
}

function HomeScreenSteps() {
  return (
    <ol className="steps">
      <li>Open this page in <strong>Safari</strong>.</li>
      <li>Tap <strong>Share</strong> (the square with the arrow), then <strong>Add to Home Screen</strong>.</li>
      <li>Open <strong>Anytimers</strong> from your Home Screen and turn notifications on there.</li>
    </ol>
  );
}

/** Full controls, for the Crew page. */
export function NotifySettings() {
  const { state, msg, busy, enable, disable, test } = usePush();
  return (
    <div className="panel form">
      {state === "checking" && <p className="sub">Checking this device…</p>}
      {state === "needs-home-screen" && (<><p>On iPhone, notifications only work from the Home Screen app.</p><HomeScreenSteps /></>)}
      {state === "unsupported" && <p className="sub">This browser can&apos;t do notifications. On iPhone, add the app to your Home Screen. On Android, use Chrome.</p>}
      {state === "not-configured" && <p className="sub">Notifications aren&apos;t set up on the server yet.</p>}
      {state === "denied" && (
        <p className="sub">Notifications are blocked for this app. Turn them on in <strong>Settings → Notifications → Anytimers</strong> (iPhone) or your browser&apos;s site settings, then reopen the app.</p>
      )}
      {state === "off" && (
        <>
          <p className="sub">Get a ping when someone challenges you, reports a result, or calls an anytimer on you.</p>
          <div className="actions"><button className="btn btn-primary" type="button" onClick={enable} disabled={busy}>Turn on notifications</button></div>
        </>
      )}
      {state === "on" && (
        <>
          <p><strong>Notifications are on</strong> for this device.</p>
          <div className="actions">
            <button className="btn btn-ghost" type="button" onClick={test} disabled={busy}>Send a test</button>
            <button className="btn btn-text" type="button" onClick={disable} disabled={busy}>Turn off</button>
          </div>
        </>
      )}
      {msg?.error && <p className="err" role="alert">{msg.error}</p>}
      {msg?.ok && <p className="ok" role="status">{msg.ok}</p>}
    </div>
  );
}

/** Small nudge on the Tab page until notifications are on (or dismissed). */
export function NotifyBanner() {
  const { state, msg, busy, enable } = usePush();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setHidden(false); }
  }, []);
  const dismiss = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch {} };

  if (hidden || !(state === "off" || state === "needs-home-screen") || msg?.ok) {
    return msg?.ok ? <p className="notice">{msg.ok}</p> : null;
  }
  return (
    <div className="notice notify-banner">
      {state === "off" ? (
        <>
          <span>Get a ping when someone calls an anytimer on you.</span>
          <span className="actions">
            <button className="btn btn-primary" type="button" onClick={enable} disabled={busy}>Turn on notifications</button>
            <button className="btn btn-text" type="button" onClick={dismiss}>Not now</button>
          </span>
        </>
      ) : (
        <>
          <span>Want notifications? Add Anytimers to your Home Screen: in Safari, tap <strong>Share → Add to Home Screen</strong>, then open it from there.</span>
          <span className="actions"><button className="btn btn-text" type="button" onClick={dismiss}>Got it</button></span>
        </>
      )}
      {msg?.error && <p className="err" role="alert">{msg.error}</p>}
    </div>
  );
}
