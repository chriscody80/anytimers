import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/env";

// Keeps the Supabase session fresh on every request.
export async function proxy(request: NextRequest) {
  // If Supabase sends a sign-in link to the wrong page (e.g. the home page when the
  // redirect URL isn't allow-listed), forward it to the callback that completes sign-in.
  const url = request.nextUrl;
  if (url.pathname !== "/auth/callback" && (url.searchParams.has("code") || url.searchParams.has("token_hash"))) {
    const to = url.clone();
    to.pathname = "/auth/callback";
    return NextResponse.redirect(to);
  }

  let response = NextResponse.next({ request });
  if (!supabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
