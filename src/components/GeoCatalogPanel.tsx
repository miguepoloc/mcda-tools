'use client';

/** Solo docente (admin): publica las capas y la configuración de este proyecto como un paquete del
 * catálogo, para que los estudiantes creen un mapa con esos datos ya preparados (solo lectura). */
import { useState, type MutableRefObject } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publishToCatalog } from '@/lib/geo/catalog';
import { slug } from '@/lib/geo/export';
import type { Criterion, GeoConfig } from '@/lib/types';

type Props = {
  sb: SupabaseClient; userId: string; title: string; objective: string;
  criteria: Criterion[]; geo: GeoConfig; cache: MutableRefObject<Record<string, Float32Array>>; ready: boolean;
};

export default function GeoCatalogPanel(p: Props) {
  const [id, setId] = useState(() => slug(p.title).slice(0, 30) + '-v1');
  const [title, setTitle] = useState(p.title);
  const [desc, setDesc] = useState(p.objective);
  const [attr, setAttr] = useState('');
  const [lic, setLic] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(p.geo.layers ?? {}).map(([k, l]) => [k, l.license ?? ''])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const layers = Object.entries(p.geo.layers ?? {});
  const unsaved = layers.filter(([k]) => !p.cache.current[k]).length;
  const idOk = /^[a-z0-9][a-z0-9-]{1,40}$/.test(id);

  async function go() {
    setBusy(true); setMsg('');
    try {
      await publishToCatalog(p.sb, { id, title: title.trim(), description: desc.trim(), attribution: attr.trim(), userId: p.userId, criteria: p.criteria, geo: p.geo, layers: p.cache.current, licenses: lic },
        (d, t) => setMsg(`Subiendo capas… ${d}/${t}`));
      setMsg(`Paquete «${id}» publicado en el catálogo. Aparece en «Punto de partida» de los proyectos nuevos.`);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <section className="gv-sec">
      <header><h4>Catálogo del curso</h4><span className="gv-badge ok">docente</span></header>
      <p className="gv-hint">Publica este proyecto como paquete: sus capas ya alineadas quedan en un almacén <b>público</b> del curso y los estudiantes lo eligen al crear un mapa. Usa solo datos que puedas compartir (cita la fuente).</p>
      <label className="gv-field"><span>Identificador (minúsculas y guiones)</span><input type="text" value={id} onChange={(e) => setId(e.target.value.toLowerCase())} />
        {!idOk && <small className="gv-hint warn">Solo a-z, 0-9 y guiones (2 a 41 caracteres).</small>}</label>
      <label className="gv-field"><span>Título</span><input type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="gv-field"><span>Descripción</span><input type="text" value={desc} maxLength={2000} onChange={(e) => setDesc(e.target.value)} /></label>
      <label className="gv-field"><span>Fuente / atribución de los datos</span><input type="text" value={attr} maxLength={1000} placeholder="p. ej. SIAM-INVEMAR 2016; Shipmap" onChange={(e) => setAttr(e.target.value)} /></label>
      <div className="gv-field"><span>Licencia o condiciones de uso, por capa</span>
        {layers.map(([k, l]) => (
          <label key={k} className="gv-lic"><span title={l.source}>{l.label}</span>
            <input type="text" value={lic[k] ?? ''} maxLength={200} placeholder="p. ej. CC-BY 4.0 · uso académico" onChange={(e) => setLic((v) => ({ ...v, [k]: e.target.value }))} /></label>
        ))}
        {layers.some(([k]) => !(lic[k] ?? '').trim()) && <small className="gv-hint warn">Hay capas sin licencia indicada: los estudiantes las verán sin condiciones de uso.</small>}
      </div>
      {unsaved > 0 && <p className="gv-hint warn">{unsaved} capa(s) no están cargadas en memoria; espera a que termine la carga del mapa.</p>}
      <div className="gv-row-acts">
        <button type="button" className="btn primary sm" disabled={busy || !p.ready || !idOk || !title.trim() || unsaved > 0} onClick={go}>{busy ? 'Publicando…' : 'Publicar en el catálogo'}</button>
      </div>
      {msg && <p className="gv-hint" role="status">{msg}</p>}
    </section>
  );
}
