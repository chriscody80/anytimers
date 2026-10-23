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
          <p className="sub">No password. We&apos;ll email you a sign-in code.</p>
        </div>
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
