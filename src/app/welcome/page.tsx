import { redirect } from "next/navigation";
import { saveName } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Brand } from "@/components/shell";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/tab";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!supabaseConfigured) redirect("/setup");
  const next = safeNext((await searchParams).next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded").eq("id", user.id).single();

  return (
    <main className="wrap narrow">
      <Brand />
      <ActionForm action={saveName} fields={{ next }}>
        <div className="hero" style={{ padding: 0 }}>
          <h2>What do your friends call you?</h2>
          <p className="sub">This is the name on the tab. You can change it later.</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" type="text" maxLength={40} autoComplete="nickname"
            defaultValue={profile?.display_name ?? ""} placeholder="First name or nickname" />
        </div>
        <div className="actions"><SubmitButton>Continue</SubmitButton></div>
      </ActionForm>
    </main>
  );
}
