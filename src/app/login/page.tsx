import { redirect } from "next/navigation";
import { Brand } from "@/components/shell";
import { safeNext } from "@/lib/tab";
import { supabaseConfigured } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (!supabaseConfigured) redirect("/setup");
  const { next, error } = await searchParams;
  return (
    <main className="wrap narrow">
      <Brand />
      {error && <p className="notice">Sign-in didn&apos;t go through. Try again, or use the other sign-in option.</p>}
      <LoginForm next={safeNext(next)} />
    </main>
  );
}
