import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTEGIDAS = ['/dashboard', '/projects', '/admin', '/cuenta'];

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key-no-configurada',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const protegida = PROTEGIDAS.some((p) => path === p || path.startsWith(p + '/'));
  if (!user && protegida) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?next=' + encodeURIComponent(path);
    return NextResponse.redirect(url);
  }

  // Cuenta pausada o suspendida con una sesión que sigue viva (otro dispositivo, o un JWT aún vigente):
  // se cierra la sesión y se manda al login con el motivo. Esto es solo la cara visible; lo que de verdad
  // corta el acceso a los datos son las políticas RLS restrictivas y banned_until (migración 15). Si el
  // RPC falla (p. ej. migración aún sin aplicar) NO se bloquea a nadie: la seguridad no depende de esto.
  if (user && protegida) {
    const { data: estado, error } = await supabase.rpc('my_account_status');
    if (!error && (estado === 'suspended' || estado === 'paused')) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '?motivo=' + (estado === 'suspended' ? 'suspendida' : 'pausada');
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }
  return response;
}
