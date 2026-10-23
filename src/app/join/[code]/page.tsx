import { joinCrew } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Brand, WhoAmI } from "@/components/shell";
import { requireUser } from "@/lib/data";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { profile } = await requireUser(`/join/${encodeURIComponent(code)}`);
  return (
    <main className="wrap narrow">
      <Brand><WhoAmI name={profile.display_name} /></Brand>
      <ActionForm action={joinCrew} fields={{ code }}>
        <div className="hero" style={{ padding: 0 }}>
          <h2>You&apos;ve been invited to a crew</h2>
          <p className="sub">Join to see the tab, make bets and call in anytimers. You&apos;ll show up as <strong>{profile.display_name}</strong>.</p>
        </div>
        <div className="actions"><SubmitButton>Join the crew</SubmitButton></div>
      </ActionForm>
    </main>
  );
}
