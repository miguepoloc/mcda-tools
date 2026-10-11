import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { publicSocial } from '@/lib/publicMeta';
import PublicView from '@/components/PublicView';

/** Vista previa al compartir el enlace (WhatsApp, redes): título y objetivo del proyecto público; la imagen sale de
 * `opengraph-image.tsx` / `twitter-image.tsx`. Un enlace inexistente o privado recibe el texto genérico y no se indexa. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const { info, title, description } = await publicSocial(token);
  return {
    title,
    description,
    robots: info ? undefined : { index: false, follow: false },
    openGraph: { type: 'website', siteName: 'Plataforma MCDA', locale: 'es_CO', title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  let logged = false;
  let userEmail: string | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    logged = !!data.user;
    userEmail = data.user?.email;
  } catch { /* sin configurar */ }
  return <PublicView token={token} loggedIn={logged} userEmail={userEmail} />;
}
