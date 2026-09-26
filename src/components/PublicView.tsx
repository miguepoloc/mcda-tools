'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PublicGet } from '@/lib/types';
import Results from './Results';
import Topbar from './Topbar';
import dynamic from 'next/dynamic';
import type { PublicGeo } from './PublicGeoView';
import PublicAhp from './PublicAhp';
import { CRIT_SHEET, indexJudgments, sheetResult } from '@/lib/ahp';
import { ahpSummary, type AhpSummary } from '@/lib/geo/ahpSummary';

const PublicGeoView = dynamic(() => import('./PublicGeoView'), { ssr: false, loading: () => <p className="muted">Cargando el mapa…</p> });

export default function PublicView({ token, loggedIn, userEmail }: { token: string; loggedIn: boolean; userEmail?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<PublicGet | null | undefined>(undefined);
  const [geo, setGeo] = useState<PublicGeo | { status: 'unpublished'; title: string; objective: string } | null>(null);

  // Mapa aún sin publicar: el AHP de los criterios ya se puede mostrar (sale de public_get, sin nombres de expertos).
  const [draftAhp, setDraftAhp] = useState<AhpSummary | null>(null);
  const unpublished = geo?.status === 'unpublished';
  useEffect(() => {
    if (!unpublished) return;
    let alive = true;
    supabase.rpc('public_get', { p_token: token }).then(({ data: d, error }) => {
      if (!alive || error || !d) return;
      const pg = d as PublicGet;
      const ids = pg.experts.map((e) => e.id);
      setDraftAhp(ahpSummary(pg.project.criteria, sheetResult(CRIT_SHEET, pg.project.criteria, ids, indexJudgments(pg.judgments))));
    });
    return () => { alive = false; };
  }, [supabase, token, unpublished]);

  useEffect(() => {
    let alive = true;
    // Un mapa de aptitud sale por public_geo_get; el resto de proyectos, por public_get de siempre.
    supabase.rpc('public_geo_get', { p_token: token }).then(async ({ data: g, error: ge }) => {
      if (!alive) return;
      if (!ge && g) { setGeo(g as PublicGeo); setData(null); return; }
      const { data: d, error } = await supabase.rpc('public_get', { p_token: token });
      if (alive) setData(error || !d ? null : (d as PublicGet));
    });
    return () => { alive = false; };
  }, [supabase, token]);

  if (geo) {
    return (
      <div className="wrap" style={{ maxWidth: 'none' }}>
        <Topbar badge="PÚBLICO" subtitle="Mapa de aptitud" loggedIn={loggedIn} userEmail={userEmail}>
          <span className="muted" style={{ fontSize: 13, background: 'var(--surface2)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)' }}>Vista pública de solo lectura</span>
        </Topbar>
        <header style={{ margin: '8px 0 16px' }}>
          <div className="eyebrow">Mapa de aptitud (AHP + SIG)</div>
          <h1 style={{ fontSize: 30 }}>{geo.title}</h1>
          {geo.objective && <p className="muted" style={{ maxWidth: '70ch' }}><b>Objetivo:</b> {geo.objective}</p>}
        </header>
        {geo.status === 'ok'
          ? <PublicGeoView data={geo} />
          : <>
              <div className="card"><p className="muted">El autor activó el enlace público pero todavía no publicó el mapa{draftAhp ? '; mientras tanto puedes ver el análisis AHP de los criterios.' : '. Vuelve más tarde.'}</p></div>
              {draftAhp && <div className="card" style={{ marginTop: 16 }}><PublicAhp ahp={draftAhp} /></div>}
            </>}
      </div>
    );
  }

  if (data === undefined) return <div className="wrap"><p className="muted">Cargando…</p></div>;
  if (data === null) {
    return (
      <div className="wrap"><div className="hero"><h1>Este contenido no está disponible</h1>
        <p className="muted">El enlace no existe o su autor lo volvió privado.</p></div></div>
    );
  }
  return (
    <div className="wrap">
      <Topbar badge="PÚBLICO" subtitle="Vista de Resultados" loggedIn={loggedIn} userEmail={userEmail}>
        <span className="muted" style={{ fontSize: 13, background: 'var(--surface2)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)' }}>
          Vista pública de solo lectura
        </span>
      </Topbar>
      <div className="panel">
        <header>
          <div className="eyebrow">Resultados {(data.project.method ?? 'ahp').toUpperCase()}</div>
          <h1 style={{ fontSize: 30 }}>{data.project.title}</h1>
          {data.project.objective && <p className="muted" style={{ maxWidth: '70ch' }}><b>Objetivo:</b> {data.project.objective}</p>}
        </header>
        <Results
          mode="single"
          criteria={data.project.criteria}
          alternatives={data.project.alternatives}
          experts={data.experts}
          judgments={data.judgments}
          method={data.project.method}
          weightingMethod={data.project.weighting_method ?? 'ahp'}
          decisionMatrix={data.project.decision_matrix}
          projectTitle={data.project.title}
          projectObjective={data.project.objective}
        />
      </div>
    </div>
  );
}
