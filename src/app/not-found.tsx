import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import NotFoundScene from '@/components/NotFoundScene';

export const metadata: Metadata = {
  title: 'Página no encontrada · Plataforma MCDA',
  robots: { index: false },
};

export default async function NotFound() {
  let logged = false;
  let userEmail: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    logged = !!data.user;
    userEmail = data.user?.email;
  } catch { /* sin sesión o Supabase sin configurar: se muestra como visitante */ }

  return (
    <div className="wrap">
      <Topbar badge="404" subtitle="Ruta no encontrada" loggedIn={logged} userEmail={userEmail} />
      <NotFoundScene />
    </div>
  );
}
