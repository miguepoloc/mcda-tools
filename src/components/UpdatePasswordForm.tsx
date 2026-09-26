'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, supabaseConfigurado } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import Topbar from '@/components/Topbar';

export default function UpdatePasswordForm({ loggedIn, userEmail }: { loggedIn: boolean; userEmail?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const hasMinLength = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = hasMinLength && passwordsMatch && !busy;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSuccess && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    } else if (isSuccess && countdown === 0) {
      router.push('/dashboard');
      router.refresh();
    }
    return () => clearTimeout(timer);
  }, [isSuccess, countdown, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMsg(friendlyError(error, 'No se pudo actualizar la contraseña.'));
      setBusy(false);
    } else {
      setIsSuccess(true);
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <Topbar badge="SEGURIDAD" subtitle="← Ir al inicio" loggedIn={loggedIn} userEmail={userEmail} />

      <div style={{ maxWidth: 440, margin: '48px auto 80px', display: 'grid', gap: 18 }}>
        <div>
          <div className="eyebrow">Seguridad de la cuenta</div>
          <h1 style={{ fontSize: 26, margin: '6px 0 8px' }}>Nueva contraseña</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Elige una contraseña de al menos 8 caracteres para proteger tus proyectos.
          </p>
        </div>

        {!supabaseConfigurado && (
          <div className="banner">
            <span><b>Falta configurar Supabase.</b> Verifica las variables de entorno del sistema.</span>
          </div>
        )}

        {!loggedIn && !isSuccess ? (
          // El enlace del correo inicia una sesión de recuperación: sin sesión, `updateUser` fallaría con un error
          // genérico. Se dice claro y se ofrece pedir otro enlace.
          <div className="card" style={{ borderTop: '3px solid var(--warn)', display: 'grid', gap: 12, padding: 24 }} role="alert">
            <h2 style={{ fontSize: 18 }}>Este enlace ya no es válido</h2>
            <p className="muted" style={{ fontSize: 14 }}>
              Los enlaces para restablecer la contraseña caducan y solo se pueden usar una vez. Pide uno nuevo desde
              «¿Olvidaste tu contraseña?» en la pantalla de acceso.
            </p>
            <Link className="btn primary" href="/login">Ir a iniciar sesión</Link>
          </div>
        ) : isSuccess ? (
          <div className="card" style={{ borderTop: '3px solid var(--pass)', display: 'grid', gap: 14, padding: 24, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--pass)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 22, fontWeight: 700 }}>
              ✓
            </div>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>¡Contraseña actualizada!</h3>
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                Tu contraseña se cambió correctamente. Te llevamos a tus proyectos en <b>{countdown}s</b>…
              </p>
            </div>
            <button className="btn primary" onClick={() => { router.push('/dashboard'); router.refresh(); }}>
              Ir a mis proyectos ahora →
            </button>
          </div>
        ) : (
          <form className="card form" onSubmit={submit} style={{ borderTop: '3px solid var(--accent)' }}>
            <div>
              <label className="lbl" htmlFor="np">Nueva contraseña</label>
              <div className="pwfield">
                <input
                  id="np"
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                />
                <button type="button" className="pwtoggle" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw} aria-label={showPw ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}>
                  {showPw ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div>
              <label className="lbl" htmlFor="cp">Confirmar nueva contraseña</label>
              <input
                id="cp"
                type={showPw ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Repite la contraseña"
              />
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', display: 'grid', gap: 6, fontSize: 12.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: hasMinLength ? 'var(--pass)' : 'var(--muted)' }}>
                <span aria-hidden="true">{hasMinLength ? '●' : '○'}</span>
                <span>{hasMinLength ? 'Cumple: mínimo 8 caracteres' : 'Pendiente: mínimo 8 caracteres'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: passwordsMatch ? 'var(--pass)' : 'var(--muted)' }}>
                <span aria-hidden="true">{passwordsMatch ? '●' : '○'}</span>
                <span>{passwordsMatch ? 'Cumple: las contraseñas coinciden' : 'Pendiente: las contraseñas deben coincidir'}</span>
              </div>
            </div>

            {msg && (
              <div className="banner" role="alert" style={{ margin: 0, fontSize: 13.5 }}>
                <span><b>Error:</b> {msg}</span>
              </div>
            )}

            <button className="btn primary" type="submit" disabled={!canSubmit}>
              {busy ? 'Guardando…' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}

        <p className="muted" style={{ fontSize: 12.5, textAlign: 'center' }}>
          ¿Recordaste tu contraseña anterior? <Link href="/login">Iniciar sesión</Link>
        </p>
      </div>
    </div>
  );
}
