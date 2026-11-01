"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { claimGroupResult, createGroupBet } from "@/app/actions";
import { Stepper, SubmitButton } from "./forms";

/** "1-on-1 | Group" switch above the new-bet forms. */
export function NewBetSwitch({ one, group }: { one: ReactNode; group: ReactNode }) {
  const [mode, setMode] = useState<"one" | "group">("one");
  return (
    <div className="section">
      <div className="section-head">
        <h2>New bet</h2>
        <div className="seg seg-small" role="group" aria-label="Bet type">
          <button type="button" aria-pressed={mode === "one"} onClick={() => setMode("one")}>1-on-1</button>
          <button type="button" aria-pressed={mode === "group"} onClick={() => setMode("group")}>Group</button>
        </div>
      </div>
      <div hidden={mode !== "one"}>{one}</div>
      <div hidden={mode !== "group"}>{group}</div>
    </div>
  );
}

export function GroupBetForm({ crew }: { crew: string }) {
  const [state, formAction] = useActionState(createGroupBet, null);
  const [mode, setMode] = useState<"options" | "losers">("options");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [pick, setPick] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state?.ok) { setOptions(["", ""]); setPick(null); setFormKey((k) => k + 1); }
  }, [state]);

  const filled = options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  const pickIndexAmongFilled = pick == null ? "" : String(filled.findIndex((x) => x.i === pick));

  return (
    <form action={formAction} className="panel form" noValidate key={formKey}>
      <input type="hidden" name="crew" value={crew} />
      <p className="sub">Anyone in the crew can join until it&apos;s locked. Each loser owes each winner.</p>
      <div className="field">
        <label className="label" htmlFor="g-title">What&apos;s the group betting on?</label>
        <textarea id="g-title" name="title" rows={2} maxLength={280} placeholder="Who wins Giants vs Cowboys?" />
      </div>

      <div className="field">
        <span className="label">How do people lose?</span>
        <div className="seg">
          <button type="button" aria-pressed={mode === "options"} onClick={() => setMode("options")}>Everyone picks an option</button>
          <button type="button" aria-pressed={mode === "losers"} onClick={() => setMode("losers")}>Mark losers at the end</button>
        </div>
        <p className="sub">
          {mode === "options" ? "Wrong picks lose." : "Good for games and contests: fantasy week, golf, beer pong."}
        </p>
      </div>

      {mode === "options" && (
        <div className="field">
          <span className="label">Options</span>
          <div className="opt-edit">
            {options.map((o, i) => (
              <div className="opt-row" key={i}>
                <input type="text" name="option" maxLength={60} value={o} aria-label={`Option ${i + 1}`}
                  placeholder={["Giants", "Cowboys", "Tie", "Option 4", "Option 5", "Option 6"][i]}
                  onChange={(e) => setOptions((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
                {options.length > 2 && (
                  <button type="button" className="btn btn-text" aria-label={`Remove option ${i + 1}`}
                    onClick={() => { setOptions((xs) => xs.filter((_, j) => j !== i)); setPick((p) => (p === i ? null : p != null && p > i ? p - 1 : p)); }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 6 && (
            <div className="actions"><button type="button" className="btn btn-ghost" onClick={() => setOptions((xs) => [...xs, ""])}>Add option</button></div>
          )}
        </div>
      )}

      {mode === "options" && filled.length >= 2 && (
        <div className="field">
          <span className="label">Your pick</span>
          <div className="seg">
            {filled.map((x) => (
              <button type="button" key={x.i} aria-pressed={pick === x.i} onClick={() => setPick(x.i)}>{x.o}</button>
            ))}
          </div>
        </div>
      )}
      {/* The server sees only the filled-in options, so send the pick as a position among those. */}
      <input type="hidden" name="my_pick" value={mode === "options" ? pickIndexAmongFilled : ""} />

      <Stepper name="stakes" label="Each loser owes each winner" max={5} />
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok" role="status">{state.ok}</p>}
      <div className="actions"><SubmitButton>Send to the crew</SubmitButton></div>
    </form>
  );
}

export function ReportGroupResult({
  crew, group, options, players,
}: {
  crew: string; group: string; options: string[]; players: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState<number | null>(null);
  const [losers, setLosers] = useState<string[]>([]);
  const [off, setOff] = useState(false);
  const [state, formAction] = useActionState(claimGroupResult, null);

  if (!open) {
    return <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>Report result</button>;
  }
  const ready = off || (options.length ? option != null : losers.length > 0 && losers.length < players.length);

  return (
    <form action={formAction} className="settle" noValidate>
      <input type="hidden" name="crew" value={crew} />
      <input type="hidden" name="group" value={group} />
      <input type="hidden" name="outcome" value={off ? "void" : "result"} />
      <input type="hidden" name="option" value={!off && option != null ? String(option) : ""} />
      {!off && losers.map((id) => <input key={id} type="hidden" name="loser" value={id} />)}

      {options.length > 0 ? (
        <>
          <span className="label">Which option won?</span>
          <div className="seg">
            {options.map((o, i) => (
              <button key={i} type="button" aria-pressed={!off && option === i} onClick={() => { setOff(false); setOption(i); }}>{o}</button>
            ))}
            <button type="button" aria-pressed={off} onClick={() => setOff(true)}>Call it off</button>
          </div>
        </>
      ) : (
        <>
          <span className="label">Who lost?</span>
          <div className="checks">
            {players.map((p) => (
              <label key={p.id} className="check">
                <input type="checkbox" checked={!off && losers.includes(p.id)} disabled={off}
                  onChange={(e) => setLosers((xs) => (e.target.checked ? [...xs, p.id] : xs.filter((x) => x !== p.id)))} />
                {p.name}
              </label>
            ))}
          </div>
          <div className="seg"><button type="button" aria-pressed={off} onClick={() => setOff((v) => !v)}>Call it off instead</button></div>
          {!off && losers.length >= players.length && <p className="err">Somebody has to win. Uncheck at least one person.</p>}
        </>
      )}
      <div className="field">
        <label className="label" htmlFor={`gnote-${group}`}>How it was settled</label>
        <textarea id={`gnote-${group}`} name="note" rows={2} maxLength={500} placeholder="Final score 24–17" />
      </div>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <div className="actions">
        <SubmitButton disabled={!ready}>Send for confirmation</SubmitButton>
        <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
