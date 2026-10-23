"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({ children, variant = "primary", disabled }: { children: ReactNode; variant?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn btn-${variant}`} type="submit" disabled={pending || disabled} aria-busy={pending}>
      {children}
    </button>
  );
}

function Hidden({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

/** One-button form, e.g. Accept / Call one in. Errors show under the button. */
export function ActBtn({
  action, fields, children, variant = "primary", confirm,
}: {
  action: Action; fields: Record<string, string>; children: ReactNode; variant?: string; confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <form action={formAction} className="act" onSubmit={(e) => {
      if (confirm && !armed) { e.preventDefault(); setArmed(true); }
    }}>
      <Hidden fields={fields} />
      <SubmitButton variant={confirm && armed ? "danger" : variant}>{confirm && armed ? confirm : children}</SubmitButton>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
    </form>
  );
}

/** Multi-field form with an inline message line. Resets its fields after a successful save when resetOnOk. */
export function ActionForm({
  action, fields = {}, children, className = "panel form", resetOnOk,
}: {
  action: Action; fields?: Record<string, string>; children: ReactNode; className?: string; resetOnOk?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate>
      <Hidden fields={fields} />
      {children}
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok" role="status">{state.ok}</p>}
    </form>
  );
}

export function Stepper({ name, min = 1, max = 10, initial = 1, label }: { name: string; min?: number; max?: number; initial?: number; label: string }) {
  const [v, setV] = useState(initial);
  return (
    <div className="field">
      <span className="label" id={`${name}-lbl`}>{label}</span>
      <div className="stepper" role="group" aria-labelledby={`${name}-lbl`}>
        <button type="button" onClick={() => setV((x) => Math.max(min, x - 1))} aria-label="One fewer">−</button>
        <output aria-live="polite">{v} × 12 oz</output>
        <button type="button" onClick={() => setV((x) => Math.min(max, x + 1))} aria-label="One more">+</button>
      </div>
      <input type="hidden" name={name} value={v} />
    </div>
  );
}
