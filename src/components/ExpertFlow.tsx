'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import type { ExpertGet } from '@/lib/types';
import { indexJudgments } from '@/lib/ahp';
import { isObjectiveFor, WEIGHTING_SHORT, effectiveWeighting } from '@/lib/weightingMode';
import JudgmentEditor from './JudgmentEditor';
import Topbar from './Topbar';

export default function ExpertFlow({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<ExpertGet | null | undefined>(undefined);
  const [status, setStatus] = useState<'pending' | 'in_progress' | 'submitted'>('pending');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('expert_get', { p_token: token }).then(({ data: d, error }) => {
      if (!alive) return;
      if (error || !d) { setData(null); return; }
      setData(d as ExpertGet);
      setStatus((d as ExpertGet).expert.status);
    });
    return () => { alive = false; };
  }, [supabase, token]);

  if (data === undefined) return <div className="wrap"><p className="muted">Cargando…</p></div>;
  if (data === null) {
    return (
      <div className="wrap"><div className="hero"><h1>Enlace no válido</h1>
        <p className="muted">Este enlace no existe o fue reemplazado. Pídele al estudiante que te envíe uno nuevo.</p></div></div>
    );
  }

  // Si el proyecto pasó a CRITIC/Entropía (solo se sabe si el servidor envía weighting_method), lo que responda el experto no entra en ningún
  // resultado: se le dice y se deja de pedirle que envíe algo que no se usará. Sus respuestas anteriores se conservan por si el autor vuelve a AHP.
  const objective = isObjectiveFor(data.project.method, data.project.weighting_method);
  const submitted = status === 'submitted' || objective;
  const initial = indexJudgments(data.judgments.map((j) => ({ expert_id: 'me', ...j })))['me'] ?? {};

  async function submit() {
    const { error } = await supabase.rpc('expert_submit', { p_token: token });
    if (error) setMsg(friendlyError(error, 'No se pudieron enviar tus respuestas.'));
    else { setStatus('submitted'); setConfirm(false); window.scrollTo({ top: 0 }); }
  }

  return (
    <div className="wrap">
      <Topbar badge="EXPERTO" subtitle="Panel de Consulta" showNav={false} hideAuthAction>
        <span className="muted" style={{ fontSize: 13, background: 'var(--surface2)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)' }}>
          Respondiendo como: <b>{data.expert.name}</b>{data.expert.role_desc ? ` · ${data.expert.role_desc}` : ''}
        </span>
      </Topbar>
      <div className="panel">
        <header>
          <div className="eyebrow">Consulta a expertos</div>
          <h1 style={{ fontSize: 30 }}>{data.project.title}</h1>
          {data.project.objective && <p className="muted" style={{ maxWidth: '70ch' }}><b>Objetivo de la decisión:</b> {data.project.objective}</p>}
        </header>

        {objective ? (
          <div className="card win"><span className="big">Esta consulta ya no está activa</span>
            <span className="muted">El autor pasó a calcular los pesos de los criterios automáticamente ({WEIGHTING_SHORT[effectiveWeighting(data.project.method, data.project.weighting_method)]}), a partir de datos, así que ya no necesita juicios de expertos. No tienes que hacer nada; lo que respondiste antes se conserva pero no influye en los resultados.</span></div>
        ) : submitted ? (
          <div className="card win"><span className="big">¡Gracias! Tus respuestas fueron enviadas.</span>
            <span className="muted">Si necesitas corregir algo, pídele al estudiante que reabra tu formulario. Abajo puedes ver lo que respondiste.</span></div>
        ) : (
          <div className="card">
            <h3>Cómo responder</h3>
            <p className="muted" style={{ maxWidth: '70ch', marginTop: 6 }}>
              Verás pares de elementos. Mueve el control hacia el que consideres mejor o más importante; entre más lejos, más fuerte es tu preferencia
              (1 = igual, 3 = moderada, 5 = fuerte, 7 = muy fuerte, 9 = extrema). Tus respuestas se guardan solas. Puedes cerrar la página y volver con este mismo enlace.
              Cuando termines todas las hojas, pulsa «Enviar respuestas».
            </p>
          </div>
        )}

        <JudgmentEditor
          criteria={data.project.criteria} alternatives={data.project.alternatives} method={data.project.method} initial={initial} readOnly={submitted}
          onSet={async (sheet, key, value) => {
            const { error } = await supabase.rpc('expert_save', { p_token: token, p_sheet: sheet, p_pair: key, p_value: value });
            if (error) throw new Error(error.message);
            if (status === 'pending') setStatus('in_progress');
          }}
        />

        {!submitted && (
          <div className="card form">
            {!confirm ? (
              <div className="acts"><button className="btn primary" type="button" onClick={() => setConfirm(true)}>Enviar respuestas</button></div>
            ) : (
              <>
                <p>¿Enviar ahora? Después no podrás cambiar tus respuestas a menos que el estudiante reabra el formulario.</p>
                <div className="acts"><button className="btn primary" type="button" onClick={submit}>Sí, enviar</button><button className="btn" type="button" onClick={() => setConfirm(false)}>Seguir revisando</button></div>
              </>
            )}
            {msg && <p className="err" role="alert">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
