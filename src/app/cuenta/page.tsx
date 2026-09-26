import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import AccountActions from '@/components/AccountActions';
import { fmtDate } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** «Mi cuenta»: datos básicos y las dos acciones del propio usuario sobre su cuenta — desactivarla (pausa
 * reversible) o eliminarla con todos sus datos (irreversible). Protegida por middleware (`/cuenta`). */
export default async function CuentaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/cuenta');

  const [profileRes, projectsRes] = await Promise.all([
    supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle(),
    // El filtro por dueño es redundante con la RLS (projects_owner), pero deja claro que el número es «tuyo» aunque
    // algún día un admin pueda leer más filas.
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('owner_id', user.id),
  ]);
  const profile = profileRes.data;
  // Si la consulta falla, «—» y no «0»: un cero falso en «se borrarán tus 0 proyectos» sería peor que no decirlo.
  const proyectos = projectsRes.error ? null : (projectsRes.count ?? 0);
  const cargado = !profileRes.error && !projectsRes.error;

  return (
    <div className="wrap">
      <Topbar badge="CUENTA" subtitle="Toma de Decisiones Multicriterio" loggedIn userEmail={user.email} />
      <div className="panel">
        <header>
          <h1 style={{ fontSize: 30 }}>Mi cuenta</h1>
          <p>Tus datos y lo que puedes hacer con tu cuenta.</p>
        </header>

        {!cargado && (
          <div className="banner" role="alert">
            <span><b>No pudimos cargar todos tus datos.</b> Recarga la página; tus proyectos no se tocaron.</span>
            <Link className="btn sm" href="/cuenta">Reintentar</Link>
          </div>
        )}

        <section className="card" aria-labelledby="datos-ttl">
          <h2 id="datos-ttl" style={{ fontSize: 16, marginBottom: 10 }}>Tus datos</h2>
          <dl className="acct-dl">
            <dt>Nombre</dt><dd>{profile?.full_name || '—'}</dd>
            <dt>Correo</dt><dd className="mono">{user.email}</dd>
            {profile?.role === 'admin' && <><dt>Rol</dt><dd>Administrador</dd></>}
            <dt>Proyectos</dt><dd>{proyectos ?? '—'}</dd>
            {user.created_at && <><dt>Cuenta creada</dt><dd>{fmtDate(user.created_at)}</dd></>}
          </dl>
          <p style={{ marginTop: 14 }}><Link className="btn sm" href="/update-password">Cambiar contraseña</Link></p>
        </section>

        <AccountActions uid={user.id} email={user.email ?? ''} isAdmin={profile?.role === 'admin'} projects={proyectos} />
      </div>
    </div>
  );
}
