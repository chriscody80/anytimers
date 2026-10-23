import { Brand } from "@/components/shell";

export default function SetupPage() {
  return (
    <main className="wrap narrow">
      <Brand tagline="Almost there." />
      <div className="panel hero">
        <h2>Connect Supabase</h2>
        <p>This site isn&apos;t connected to its database yet. In your Vercel project, add these environment variables, then redeploy:</p>
        <pre className="rules-text" style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, padding: 0 }}>
{`NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`}
        </pre>
        <p className="sub">The README in the repo walks through where to find both values.</p>
      </div>
    </main>
  );
}
