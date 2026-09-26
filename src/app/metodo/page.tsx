import { createClient } from '@/lib/supabase/server';
import MetodoClient from '@/components/MetodoClient';

export const metadata = { title: '¿Qué método uso? · Plataforma MCDA' };

export default async function MetodoPage() {
  const supabase = await createClient();
  let logged = false;
  let userEmail: string | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    logged = !!data.user;
    userEmail = data.user?.email;
  } catch { /* sin configurar */ }

  return <MetodoClient loggedIn={logged} userEmail={userEmail} />;
}
