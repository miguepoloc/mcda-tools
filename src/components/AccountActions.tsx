'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { removeAllUserLayers } from '@/lib/geo/store';
import { friendlyError } from '@/lib/errors';
import ConfirmDialog from './ConfirmDialog';

type Which = 'pause' | 'delete' | null;

/** Mensajes de la base que sí se muestran tal cual (están escritos para la persona): suspendida, admin, límite. */
const SHOWN_AS_IS = /suspendida|admin|demasiadas solicitudes/i;

/** Desactivar (pausa reversible) y eliminar (irreversible) la cuenta propia. Ver 20240101000015_account_status.sql:
 * `pause_my_account()` la pausa (volver a iniciar sesión la reactiva); `delete_my_account()` la borra en cascada.
 * Los archivos de mapas viven en Storage y el SQL no puede borrarlos, así que se borran aquí PRIMERO por la API.
 * `projects` es null si no se pudo contar (mejor decir «tus proyectos» que un «0» falso). */
export default function AccountActions({ uid, email, isAdmin, projects }: { uid: string; email: string; isAdmin: boolean; projects: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<Which>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Un doble clic rápido puede colar dos envíos antes de que `busy` deshabilite el botón; esto lo cierra al instante.
  const inFlight = useRef(false);

  const close = () => { if (busy) return; setOpen(null); setTyped(''); setError(''); };
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  const projectsText = projects === null ? 'tus proyectos' : projects === 1 ? 'tu proyecto' : `tus ${projects} proyectos`;

  async function leave(motivo: 'pausada' | 'eliminada') {
    // Si cerrar la sesión falla (red), igual se sigue al login: ahí, con la cuenta ya pausada/eliminada, el
    // middleware o el propio login terminan de cerrarla.
    try { await createClient().auth.signOut(); } catch { /* se sigue */ }
    router.push(`/login?motivo=${motivo}`);
    router.refresh();
  }

  async function pause() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { error: e } = await createClient().rpc('pause_my_account');
      if (e) { setError(SHOWN_AS_IS.test(e.message ?? '') ? e.message : friendlyError(e, 'No se pudo desactivar la cuenta. Intenta de nuevo.')); inFlight.current = false; setBusy(false); return; }
    } catch (e) {
      setError(friendlyError(e, 'No se pudo desactivar la cuenta. Intenta de nuevo.')); inFlight.current = false; setBusy(false); return;
    }
    await leave('pausada');
  }

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const fail = (msg: string) => { setError(msg); inFlight.current = false; setBusy(false); };
    const sb = createClient();
    let filesRemoved = 0;
    try { filesRemoved = await removeAllUserLayers(sb, uid); }
    catch (e) { return fail(friendlyError(e, 'No pudimos borrar tus mapas guardados. No se eliminó nada: intenta de nuevo.')); }
    try {
      const { error: e } = await sb.rpc('delete_my_account');
      if (e) {
        const raw = e.message ?? '';
        const base = SHOWN_AS_IS.test(raw) ? raw : friendlyError(e, 'No se pudo eliminar la cuenta. Intenta de nuevo.');
        // Los archivos se borran ANTES que la cuenta: si la cuenta falla después, hay que decir que los mapas ya no están.
        return fail(filesRemoved > 0 ? `${base} Ojo: tus ${filesRemoved} archivo(s) de mapas ya se borraron; tus proyectos y tu cuenta siguen ahí.` : base);
      }
    } catch (e) {
      return fail(friendlyError(e, 'No se pudo eliminar la cuenta. Intenta de nuevo.') + (filesRemoved > 0 ? ` Ojo: tus ${filesRemoved} archivo(s) de mapas ya se borraron; tu cuenta sigue ahí.` : ''));
    }
    await leave('eliminada');
  }

  return (
    <>
      <section className="card acct-zone" aria-labelledby="pausa-ttl">
        <div>
          <h2 id="pausa-ttl" style={{ fontSize: 16 }}>Desactivar mi cuenta</h2>
          <p className="muted">Es una pausa, no un borrado. Cerramos tu sesión y, mientras la cuenta esté desactivada, tus enlaces (los de tus expertos
            y los públicos) dejan de funcionar: quien los abra verá un enlace no válido. Tus proyectos, juicios y mapas <b>se conservan</b>.
            {' '}<b>Para reactivarla, basta con volver a iniciar sesión</b>: todo vuelve como estaba.</p>
          {isAdmin && <p className="muted" style={{ marginTop: 2 }}>Las cuentas de administrador no se desactivan desde aquí.</p>}
        </div>
        <button type="button" className="btn" onClick={() => setOpen('pause')} disabled={isAdmin}>Desactivar cuenta…</button>
      </section>

      <section className="card acct-zone danger" aria-labelledby="borrar-ttl">
        <div>
          <h2 id="borrar-ttl" style={{ fontSize: 16 }}>Eliminar mi cuenta y mis datos</h2>
          <p className="muted">Borra <b>para siempre</b> tu cuenta y todo lo que hay en ella: {projectsText}, los juicios de tus expertos (también los de
            quienes ya enviaron sus respuestas), los mapas que subiste y tus enlaces, que dejarán de abrir. <b>No se puede deshacer y no hay copia de seguridad</b>:
            si quieres conservar algo, exporta antes tus resultados a Excel desde cada proyecto. Si solo necesitas una pausa, usa «Desactivar cuenta».
            Solo queda un registro anónimo (sin tu correo) de que la cuenta se eliminó.</p>
          {isAdmin && <p className="muted" style={{ marginTop: 2 }}>Las cuentas de administrador no se eliminan desde aquí.</p>}
        </div>
        <button type="button" className="btn danger" onClick={() => setOpen('delete')} disabled={isAdmin}>Eliminar cuenta…</button>
      </section>

      {open === 'pause' && (
        <ConfirmDialog
          title="¿Desactivar tu cuenta?" tone="neutral" confirmLabel="Desactivar y salir" busyLabel="Desactivando…"
          busy={busy} error={error} onConfirm={() => void pause()} onClose={close}
          description={
            <>
              <p>Al desactivar la cuenta de <b className="mono">{email}</b>:</p>
              <ul className="modal-list">
                <li>Cerramos tu sesión ahora mismo.</li>
                <li>Tus enlaces de expertos y los públicos dejan de funcionar hasta que vuelvas; tus expertos no podrán responder mientras tanto.</li>
                <li>Tus proyectos y datos <b>se conservan</b>. Al iniciar sesión de nuevo, todo vuelve como estaba.</li>
              </ul>
            </>
          }
        />
      )}

      {open === 'delete' && (
        <ConfirmDialog
          title="Eliminar cuenta y datos" confirmLabel="Eliminar para siempre" busyLabel="Eliminando…"
          confirmDisabled={!matches} busy={busy} error={error} onConfirm={() => void remove()} onClose={close}
          description={
            <>
              <p>Se borrarán <b>para siempre</b>, sin copia:</p>
              <ul className="modal-list">
                <li>La cuenta <b className="mono">{email}</b>.</li>
                <li>{projectsText[0].toUpperCase() + projectsText.slice(1)} y los juicios de sus expertos.</li>
                <li>Los mapas que subiste.</li>
                <li>Tus enlaces de expertos y públicos: dejarán de abrir.</li>
              </ul>
              <p><b>Esta acción no se puede deshacer.</b></p>
            </>
          }
        >
          <div className="confirm-field">
            <label className="lbl" htmlFor="del-acct">Para confirmar, escribe tu correo</label>
            <input id="del-acct" type="text" autoComplete="off" spellCheck={false} value={typed} placeholder={email}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && matches && !busy) void remove(); }} />
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
