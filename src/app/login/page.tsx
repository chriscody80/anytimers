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
      {error && <p className="notice">That sign-in link didn&apos;t work. It may have expired or been opened in a different browser. Enter your email again and use the code instead.</p>}
      <LoginForm next={safeNext(next)} />
    </main>
  );
}
