import Link from "next/link";
import { createCrew, joinCrew } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Brand, WhoAmI } from "@/components/shell";
import { requireUser } from "@/lib/data";

export default async function StartPage() {
  const { profile } = await requireUser("/start");
  return (
    <main className="wrap narrow">
      <Brand><WhoAmI name={profile.display_name} extra={<Link className="linkish" href="/crews">Crews</Link>} /></Brand>
      <div className="section">
        <div className="section-head"><h2>Start a crew</h2></div>
        <ActionForm action={createCrew}>
          <p className="sub">A crew is your group of friends. Only people with your invite link can see it.</p>
          <div className="field">
            <label className="label" htmlFor="crew-name">Crew name</label>
            <input id="crew-name" name="name" type="text" maxLength={60} placeholder="Sunday Football" />
          </div>
          <div className="actions"><SubmitButton>Start crew</SubmitButton></div>
        </ActionForm>
      </div>
      <div className="section">
        <div className="section-head"><h2>Join a crew</h2></div>
        <ActionForm action={joinCrew}>
          <div className="field">
            <label className="label" htmlFor="code">Invite link or code</label>
            <input id="code" name="code" type="text" autoComplete="off" placeholder="Paste the link a friend sent you" />
          </div>
          <div className="actions"><SubmitButton variant="ghost">Join</SubmitButton></div>
        </ActionForm>
      </div>
    </main>
  );
}
