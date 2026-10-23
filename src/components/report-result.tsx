"use client";

import { useActionState, useState } from "react";
import { claimResult } from "@/app/actions";
import { SubmitButton } from "./forms";

export function ReportResult({
  crew, bet, options,
}: {
  crew: string; bet: string; options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [state, formAction] = useActionState(claimResult, null);

  if (!open) {
    return (
      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>Report result</button>
      </div>
    );
  }

  return (
    <form action={formAction} className="settle" noValidate>
      <input type="hidden" name="crew" value={crew} />
      <input type="hidden" name="bet" value={bet} />
      <input type="hidden" name="result" value={pick} />
      <span className="label">What happened?</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={pick === o.value} onClick={() => setPick(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="field">
        <label className="label" htmlFor={`note-${bet}`}>How it was settled</label>
        <textarea id={`note-${bet}`} name="note" rows={2} maxLength={500} placeholder="Final score 24–17, Giants by 7" />
      </div>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <div className="actions">
        <SubmitButton disabled={!pick}>Send for confirmation</SubmitButton>
        <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
