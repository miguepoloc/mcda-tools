import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Confirmar el correo o recuperar la contraseña también es un inicio de sesión: quita la pausa,
      // pero una suspensión no se levanta aquí.
      const { data: estado } = await supabase.rpc('resume_my_account');
      if (estado === 'suspended') {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?motivo=suspendida`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}
