import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProjectWorkspace from '@/components/ProjectWorkspace';
import Topbar from '@/components/Topbar';
import type { ExpertRow, JudgmentRow, ProjectRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/projects/${id}`);

  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (!project) notFound();
  const { data: experts } = await supabase.from('experts').select('*').eq('project_id', id).order('position').order('created_at');
  const ids = (experts ?? []).map((e) => e.id);
  const { data: judgments } = ids.length
    ? await supabase.from('judgments').select('expert_id,sheet,pair_key,value').in('expert_id', ids).limit(20000)
    : { data: [] };

  return (
    <div className="wrap">
      <Topbar badge="PRO" subtitle="← Mis proyectos" href="/dashboard" title="Volver al panel de proyectos" loggedIn userEmail={user.email} />
      <ProjectWorkspace
        initialProject={project as ProjectRow}
        initialExperts={(experts ?? []) as ExpertRow[]}
        initialJudgments={(judgments ?? []) as JudgmentRow[]}
      />
    </div>
  );
}
