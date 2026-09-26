import { createClient } from '@/lib/supabase/server';
import PublicView from '@/components/PublicView';

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
