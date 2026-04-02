import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js / Vercel Edge에서는 `request.cookies.set`이 동작하지 않거나 예외를 던질 수 있어,
 * 쿠키·캐시 헤더는 `NextResponse`에만 적용합니다. (@supabase/ssr setAll 두 번째 인자)
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  if (!url || !key) {
    if (path.startsWith("/orders")) {
      const u = request.nextUrl.clone();
      u.pathname = "/login";
      u.searchParams.set("error", "env");
      return NextResponse.redirect(u);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          supabaseResponse = NextResponse.next({ request });
          if (cacheHeaders && typeof cacheHeaders === "object") {
            Object.entries(cacheHeaders).forEach(([k, v]) => {
              if (typeof v === "string") supabaseResponse.headers.set(k, v);
            });
          }
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && path.startsWith("/orders")) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", path);
      return NextResponse.redirect(redirectUrl);
    }

    if (user && path === "/login") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/orders";
      return NextResponse.redirect(redirectUrl);
    }

    return supabaseResponse;
  } catch {
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    u.searchParams.set("error", "middleware");
    return NextResponse.redirect(u);
  }
}
