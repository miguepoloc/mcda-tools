'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { Icon } from '@/components/GeoBits';
import { cloneLayers, removeProjectFolder } from '@/lib/geo/store';
import { PROJECT_LIST_SELECT, describeProject, type ProjectListRow } from '@/lib/projects';
import ConfirmDialog from '@/components/ConfirmDialog';

type Row = ProjectListRow;

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

const SEARCH_FROM = 6; // con pocos proyectos el buscador solo estorba

/** «12 sep 2026» en es-CO. Se pinta con suppressHydrationWarning: servidor y navegador pueden estar en husos distintos. */
const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function ProjectList({ initial }: { initial: Row[] }) {
  const [projects, setProjects] = useState(initial);
  const [target, setTarget] = useState<Row | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [dupId, setDupId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [delErr, setDelErr] = useState('');
  const [q, setQ] = useState('');

  async function confirmDelete() {
    if (!target) return;
    setBusy(true);
    const sb = createClient();
    try {
      // Borra también los mapas subidos (Storage no se borra en cascada con la fila).
      const { data: u } = await sb.auth.getUser();
      if (u.user) await removeProjectFolder(sb, u.user.id, target.id);
    } catch { /* mejor esfuerzo: si falla, el admin los ve como huérfanos */ }
    const { error } = await sb.from('projects').delete().eq('id', target.id);
    setBusy(false);
    if (error) { setDelErr(friendlyError(error, 'No se pudo eliminar el proyecto.')); return; }
    setProjects((prev) => prev.filter((p) => p.id !== target.id));
    setDelErr('');
    setConfirmText('');
    setTarget(null);
    setFlash({ text: `Proyecto «${target.title}» eliminado.` });
  }

  const [flash, setFlash] = useState<{ text: string; href?: string } | null>(null);

  function askDelete(p: Row) { setConfirmText(''); setDelErr(''); setTarget(p); }

  async function duplicateProject(p: Row) {
    setBusy(true);
    setDupId(p.id);
    setMsg('');
    setFlash(null);
    const supabase = createClient();

    // Obtener sesión del usuario autenticado para satisfacer la política RLS (owner_id = auth.uid())
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData?.user?.id;
    if (!currentUserId) {
      setMsg('Sesión no válida o expirada. Por favor vuelve a iniciar sesión.');
      setBusy(false);
      setDupId(null);
      return;
    }

    const { data: orig, error: fetchErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', p.id)
      .single();

    if (fetchErr || !orig) {
      setMsg(fetchErr ? friendlyError(fetchErr, 'No se pudo leer el proyecto original.') : 'No se pudo leer el proyecto original.');
      setBusy(false);
      setDupId(null);
      return;
    }

    const { data: copyRow, error: insertErr } = await supabase
      .from('projects')
      .insert({
        owner_id: currentUserId,
        title: `${orig.title} (Copia)`,
        objective: orig.objective,
        method: orig.method,
        weighting_method: orig.weighting_method,
        criteria: orig.criteria,
        alternatives: orig.alternatives,
        decision_matrix: orig.decision_matrix,
        prioritization: orig.prioritization,
        kind: orig.kind ?? 'decision',
        geo: orig.geo ?? {},
        is_public: false,
      })
      .select(PROJECT_LIST_SELECT)
      .single();

    if (insertErr || !copyRow) {
      setMsg(insertErr ? friendlyError(insertErr, 'Error al duplicar el proyecto.') : 'Error al duplicar el proyecto.');
      setBusy(false);
      setDupId(null);
      return;
    }

    // Un mapa de aptitud arrastra sus capas propias: se copian a la carpeta del duplicado (con cuota),
    // para que borrar uno no rompa al otro.
    if (orig.kind === 'spatial' && orig.geo?.layers && Object.keys(orig.geo.layers).length) {
      try {
        const layers = await cloneLayers(supabase, currentUserId, orig.id, copyRow.id, orig.geo.layers);
        const { error: ge } = await supabase.from('projects').update({ geo: { ...orig.geo, layers } }).eq('id', copyRow.id);
        if (ge) throw new Error(ge.message);
      } catch (e) {
        await supabase.from('projects').delete().eq('id', copyRow.id);
        setMsg('No se pudo duplicar el mapa: ' + (e instanceof Error ? e.message : String(e)));
        setBusy(false);
        setDupId(null);
        return;
      }
    }

    // Duplicar también expertos y sus juicios si existen
    try {
      const { data: origExperts } = await supabase
        .from('experts')
        .select('id, name, role_desc, position, filled_by, status')
        .eq('project_id', orig.id);

      if (origExperts && origExperts.length > 0) {
        for (const exp of origExperts) {
          const { data: newExp } = await supabase
            .from('experts')
            .insert({
              project_id: copyRow.id,
              name: exp.name,
              role_desc: exp.role_desc,
              position: exp.position,
              filled_by: exp.filled_by,
              status: exp.status,
            })
            .select('id')
            .single();

          if (newExp) {
            const { data: origJudgments } = await supabase
              .from('judgments')
              .select('sheet, pair_key, value')
              .eq('expert_id', exp.id);

            if (origJudgments && origJudgments.length > 0) {
              await supabase.from('judgments').insert(
                origJudgments.map((j) => ({
                  expert_id: newExp.id,
                  sheet: j.sheet,
                  pair_key: j.pair_key,
                  value: j.value,
                }))
              );
            }
          }
        }
      }
    } catch {
      // Si la copia de expertos falla, el proyecto base ya fue duplicado exitosamente
    }

    // Los expertos se copiaron después de crear la fila: se vuelve a leer para que el resumen los cuente.
    const { data: fresh } = await supabase.from('projects').select(PROJECT_LIST_SELECT).eq('id', copyRow.id).single();
    setBusy(false);
    setDupId(null);
    setProjects((prev) => [(fresh ?? copyRow) as Row, ...prev]);
    setFlash({ text: `Se creó «${copyRow.title}»: copia del proyecto con sus expertos y juicios.`, href: `/projects/${copyRow.id}` });
  }

  const matches = target ? confirmText.trim() === target.title.trim() : false;
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => (needle ? projects.filter((p) => `${p.title} ${p.objective}`.toLowerCase().includes(needle)) : projects),
    [projects, needle],
  );

  if (!projects.length) {
    return (
      <div className="plist">
        {msg && <p className="err" role="alert">{msg}</p>}
        {flash && <FlashNote flash={flash} onClose={() => setFlash(null)} />}
        <div className="card pempty">
          <span className="pempty-ico" aria-hidden="true"><Icon d="M3 3v18h18M7 16h6M7 11h10M7 6h4" size={22} /></span>
          <div>
            <h2>Aún no tienes proyectos</h2>
            <p className="muted">
              Un proyecto reúne tu objetivo, tus criterios, tus alternativas y los juicios o datos que los comparan. Crea el
              primero abajo: nace en blanco y tú pones tu propio problema. ¿No sabes qué método elegir?{' '}
              <Link href="/metodo">Responde unas pocas preguntas</Link>.
            </p>
          </div>
          <a className="btn primary" href="#nuevo">Crear mi primer proyecto</a>
        </div>
      </div>
    );
  }

  return (
    <div className="plist">
      {msg && <p className="err" role="alert">{msg}</p>}
      {flash && <FlashNote flash={flash} onClose={() => setFlash(null)} />}

      {projects.length >= SEARCH_FROM && (
        <div className="psearch">
          <label className="sr-only" htmlFor="psearch">Buscar proyectos por título u objetivo</label>
          <input id="psearch" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título u objetivo…" autoComplete="off" />
          <span className="count" aria-live="polite">{needle ? `${shown.length} de ${projects.length}` : `${projects.length} proyectos`}</span>
        </div>
      )}

      {!shown.length && <div className="card muted">Ningún proyecto coincide con «{q.trim()}».</div>}
      {shown.map((p) => {
        const d = describeProject(p);
        const when = fmtDate(p.updated_at);
        return (
          <div className="prow" key={p.id}>
            <Link href={`/projects/${p.id}`} className="prow-main">
              <b>{p.title}</b>
              <span className="prow-obj muted" title={p.objective || undefined}>{p.objective || 'Sin objetivo todavía'}</span>
              <span className="prow-meta">
                <span className="prow-kind" data-method={d.spatial ? 'spatial' : d.method}><i aria-hidden="true" />{d.kind}</span>
                {d.weights && <span>{d.weights}</span>}
                {d.size.map((t) => <span key={t}>{t}</span>)}
                <span>{d.people}</span>
                {when && <span suppressHydrationWarning>Editado {when}</span>}
              </span>
            </Link>
            <span className={'pill ' + (p.is_public ? '' : 'neutral')}>{p.is_public ? 'Público con enlace' : 'Privado'}</span>
            <button
              type="button"
              className="btn icon sm"
              title={`Duplicar «${p.title}» (con sus expertos y juicios)`}
              aria-label={`Duplicar «${p.title}»`}
              onClick={() => void duplicateProject(p)}
              disabled={busy}
            >
              {dupId === p.id ? <span aria-hidden="true">…</span> : <CopyIcon />}
            </button>
            <button
              type="button"
              className="btn icon sm del"
              title={`Eliminar «${p.title}»`}
              aria-label={`Eliminar «${p.title}»`}
              onClick={() => askDelete(p)}
              disabled={busy}
            >
              <TrashIcon />
            </button>
          </div>
        );
      })}

      {target && (
        <ConfirmDialog
          title={`Eliminar «${target.title}»`}
          description={<p>Esta acción no se puede deshacer. Se eliminarán el proyecto, sus criterios, alternativas, juicios de expertos, mapas subidos y cualquier enlace público o de experto asociado.</p>}
          confirmLabel="Eliminar proyecto"
          busyLabel="Eliminando…"
          confirmDisabled={!matches}
          busy={busy}
          error={delErr}
          onConfirm={() => void confirmDelete()}
          onClose={() => setTarget(null)}
        >
          <div className="confirm-field">
            <label className="lbl" htmlFor="delp-input">Para confirmar, escribe el nombre del proyecto</label>
            <input
              id="delp-input"
              type="text"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={target.title}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches && !busy) void confirmDelete(); }}
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Aviso de la última acción (duplicar / eliminar). Con «Abrir» cuando hay un destino útil. */
function FlashNote({ flash, onClose }: { flash: { text: string; href?: string }; onClose: () => void }) {
  return (
    <div className="flash" role="status">
      <span aria-hidden="true" className="flash-ok">✓</span>
      <span>{flash.text}</span>
      {flash.href && <Link href={flash.href}>Abrir la copia</Link>}
      <button type="button" className="flash-x" onClick={onClose} aria-label="Cerrar aviso">×</button>
    </div>
  );
}
