'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import Topbar from './Topbar';

type Info = { title: string; open: boolean };

/** Enlace abierto de autorregistro (/o/<token>): en vez de que el dueño cree cada experto a mano, cualquiera
 * con este enlace escribe su nombre y rol y queda como un experto normal del proyecto. Al enviarse, el
 * servidor (open_join) crea esa fila y devuelve su propio invite_token; de ahí en adelante es el mismo
 * flujo de siempre (ExpertFlow / /e/<token>), sin duplicar nada de la lógica de juicios. */
export default function OpenJoin({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.rpc('open_info', { p_token: token }).then(({ data, error }) => {
      if (!alive) return;
      setInfo(error || !data ? null : (data as Info));
    });
    return () => { alive = false; };
  }, [supabase, token]);

  async function submit() {
    const n = name.trim();
    if (!n) { setMsg('Escribe tu nombre.'); return; }
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.rpc('open_join', { p_token: token, p_name: n, p_role: role.trim() });
    setBusy(false);
    if (error || !data) { setMsg(friendlyError(error, 'No se pudo completar la inscripción.')); return; }
    router.replace(`/e/${data as string}`);
  }

  return (
    <div className="wrap">
      <Topbar badge="EXPERTO" subtitle="Inscripción de panel de expertos" showNav={false} hideAuthAction />
      <div className="panel">
        {info === undefined ? (
          <p className="muted">Cargando…</p>
        ) : info === null ? (
          <div className="hero">
            <h1>Enlace no válido</h1>
            <p className="muted">Este enlace no existe o fue reemplazado. Pídele a quien te invitó un enlace nuevo.</p>
          </div>
        ) : !info.open ? (
          <div className="hero">
            <h1>Ya no se aceptan inscripciones</h1>
            <p className="muted">El enlace abierto de «{info.title}» está cerrado por ahora. Escríbele a quien te invitó.</p>
          </div>
        ) : (
          <>
            <header>
              <div className="eyebrow">Panel de expertos</div>
              <h1 style={{ fontSize: 28 }}>{info.title}</h1>
              <p className="muted" style={{ maxWidth: '60ch' }}>
                Escribe tu nombre y tu rol o perfil (por ejemplo, «Ingeniera de ML» o «Comunidad Palmor») para entrar a responder las preguntas de este proyecto. Después de inscribirte, este enlace queda solo para ti: guárdalo si quieres volver a entrar más tarde.
              </p>
            </header>
            <form className="card form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <div className="two eq">
                <div>
                  <label className="lbl" htmlFor="oj-name">Nombre</label>
                  <input id="oj-name" type="text" autoFocus maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Ana Pérez" />
                </div>
                <div>
                  <label className="lbl" htmlFor="oj-role">Rol o perfil (opcional)</label>
                  <input id="oj-role" type="text" maxLength={300} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ej.: Ingeniera de ML" />
                </div>
              </div>
              {msg && <p className="err" role="alert">{msg}</p>}
              <div className="acts">
                <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar como experto'}</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
