"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) { setErr("Enter a real email address."); return; }
    setBusy(true); setErr("");
    const { error } = await createClient().auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) { setErr(error.message.includes("rate") ? "Too many emails sent. Wait a minute and try again." : error.message); return; }
    setEmail(clean);
    setStep("code");
  }

  async function google() {
    setBusy(true); setErr("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setBusy(false); setErr("Google sign-in isn't working right now. Try email instead."); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setErr("Enter the code from the email."); return; }
    setBusy(true); setErr("");
    const { error } = await createClient().auth.verifyOtp({ email, token, type: "email" });
    if (error) { setBusy(false); setErr("That code didn't work. Check it, or send a new one."); return; }
    window.location.assign(next);
  }

  if (step === "email") {
    return (
      <form className="panel form" onSubmit={sendCode} noValidate>
        <div className="hero" style={{ padding: 0 }}>
          <h2>Sign in</h2>
          <p className="sub">One tap with Google. No password.</p>
        </div>
        <div className="actions">
          <button className="btn btn-google" type="button" onClick={google} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z"/><path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
            Continue with Google
          </button>
        </div>
        <div className="or"><span>or use email</span></div>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button></div>
      </form>
    );
  }

  return (
    <form className="panel form" onSubmit={verify} noValidate>
      <div className="hero" style={{ padding: 0 }}>
        <h2>Check your email</h2>
        <p className="sub">We sent a code to <strong>{email}</strong>. Enter it here, or tap the link in the email on this phone.</p>
      </div>
      <div className="field">
        <label className="label" htmlFor="code">Code</label>
        <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
        <button className="btn btn-ghost" type="button" onClick={() => { setStep("email"); setCode(""); setErr(""); }}>Use a different email</button>
      </div>
    </form>
  );
}
