'use client';

/** Cargador de la vista embebida `/p/<token>/embed`. Un mapa de aptitud (`public_geo_get`) se muestra con el mapa mínimo;
 * un proyecto de decisión (`public_get`), con sus resultados sin cabecera. Es solo lectura y usa las mismas funciones
 * `SECURITY DEFINER` y el mismo token que la vista pública: no expone nada más. */
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { PublicGet } from '@/lib/types';
import type { EmbedBase, EmbedPanel, EmbedStyle } from '@/lib/embed';
import type { PublicGeo } from './PublicGeoView';
import Results from './Results';
import './share.css';
import './embed.css';

const EmbedGeoView = dynamic(() => import('./EmbedGeoView'), { ssr: false, loading: () => <p className="emb-msg muted">Cargando el mapa…</p> });

type Geo = PublicGeo | { status: 'unpublished'; title: string; objective: string };

export default function EmbedView({ token, initial }: { token: string; initial: { style: EmbedStyle; base: EmbedBase; panel: EmbedPanel } }) {
  const supabase = useMemo(() => createClient(), []);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [data, setData] = useState<PublicGet | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    supabase.rpc('public_geo_get', { p_token: token }).then(async ({ data: g, error: ge }) => {
      if (!alive) return;
      if (!ge && g) { setGeo(g as Geo); setData(null); return; }
      const { data: d, error } = await supabase.rpc('public_get', { p_token: token });
      if (alive) setData(error || !d ? null : (d as PublicGet));
    });
    return () => { alive = false; };
  }, [supabase, token]);

  const link = (
    <div className="emb-foot">
      <span />
      <a href={`/p/${encodeURIComponent(token)}`} target="_blank" rel="noopener noreferrer">Ver la vista completa en mcda.tools ↗</a>
    </div>
  );

  if (geo?.status === 'ok') return <EmbedGeoView data={geo} token={token} initial={initial} />;
  if (geo?.status === 'unpublished') return <div className="emb-msg"><p className="muted">El autor aún no publicó este mapa. Vuelve más tarde.</p>{link}</div>;
  if (data === undefined) return <div className="emb-msg"><p className="muted">Cargando…</p></div>;
  if (data === null) return <div className="emb-msg"><p className="muted">Este contenido no está disponible: el enlace no existe o su autor lo volvió privado.</p></div>;
  return (
    <div className="emb-doc">
      <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>{data.project.title}</h1>
      <Results
        mode="single" criteria={data.project.criteria} alternatives={data.project.alternatives} experts={data.experts} judgments={data.judgments}
        method={data.project.method} weightingMethod={data.project.weighting_method ?? 'ahp'} decisionMatrix={data.project.decision_matrix}
        projectTitle={data.project.title} projectObjective={data.project.objective}
      />
      {link}
    </div>
  );
}
