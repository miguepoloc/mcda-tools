import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import NewProject from '@/components/NewProject';
import Topbar from '@/components/Topbar';
import ProjectList from '@/components/ProjectList';
import { PROJECT_LIST_SELECT, type ProjectListRow } from '@/lib/projects';

export const metadata = { title: 'Mis proyectos · Plataforma MCDA', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');
  const { data: projects } = await supabase
    .from('projects').select(PROJECT_LIST_SELECT).order('updated_at', { ascending: false });

  const list = (projects ?? []) as unknown as ProjectListRow[];

  return (
    <div className="wrap">
      <Topbar badge="PANEL" subtitle="Toma de Decisiones Multicriterio" loggedIn userEmail={user.email} />
      <div className="panel">
        <div className="dash-head">
          <div>
            <h1 style={{ fontSize: 30 }}>Mis proyectos</h1>
            <p className="muted">Tus modelos de decisión y mapas de aptitud, del editado más recientemente al más antiguo.</p>
          </div>
          <a className="btn primary" href="#nuevo">+ Nuevo proyecto</a>
        </div>
        <ProjectList initial={list} />
        <NewProject userId={user.id} />
      </div>
    </div>
  );
}
