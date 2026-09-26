'use client';

import Link from 'next/link';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, supabaseConfigurado } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import Topbar from '@/components/Topbar';

/** Avisos que llegan por `/login?motivo=…` (middleware, cierre de sesión al desactivar/eliminar la cuenta). */
const MOTIVOS: Record<string, { title: string; text: string; tone: 'info' | 'warn' }> = {
  pausada: { title: 'Cuenta desactivada.', text: 'Cerramos tu sesión. Cuando quieras volver, inicia sesión y se reactiva sola, con todos tus proyectos.', tone: 'info' },
  eliminada: { title: 'Cuenta eliminada.', text: 'Borramos tu cuenta y tus datos. Puedes crear una nueva cuando quieras.', tone: 'info' },
  suspendida: { title: 'Cuenta suspendida.', text: 'Un administrador suspendió esta cuenta. Escribe al docente para revisarlo.', tone: 'warn' },
  // /auth/callback redirige aquí con ?error=callback cuando el enlace del correo ya se usó o caducó.
  callback: { title: 'Ese enlace ya no es válido.', text: 'Los enlaces del correo caducan y solo sirven una vez. Inicia sesión, o usa «¿Olvidaste tu contraseña?» para pedir uno nuevo.', tone: 'warn' },
};

/** Solo rutas internas: un `?next=https://otro-sitio` haría que el login redirigiera fuera de la plataforma
 * (el callback del servidor ya filtra igual). */
const safeNext = (raw: string | null) => (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/dashboard');

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const motivoParam = params.get('motivo') ?? (params.get('error') === 'callback' ? 'callback' : null);
  const aviso = motivoParam && Object.prototype.hasOwnProperty.call(MOTIVOS, motivoParam) ? MOTIVOS[motivoParam] : null;
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'err' | 'ok'>('err');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cuenta regresiva tras enviar el enlace de recuperación: Supabase rechaza un segundo
  // envío al mismo correo antes de 60s (SMTP Settings → Minimum interval per user), así que
  // el botón refleja ese límite en vez de quedar habilitado de una.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Si ya está autenticado, redirigir directamente al destino sin mostrar el formulario de login
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        router.replace(next);
      }
    });
  }, [next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setMsgType('err');
    const supabase = createClient();

    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(friendlyError(error, 'No se pudo iniciar sesión. Intenta de nuevo.'));
      else {
        // Iniciar sesión reactiva una cuenta desactivada; una suspendida no se reactiva sola.
        const { data: estado } = await supabase.rpc('resume_my_account');
        if (estado === 'suspended') {
          await supabase.auth.signOut();
          setMsg('Tu cuenta está suspendida. Escribe al docente para revisarlo.');
        } else { router.push(next); router.refresh(); }
      }
    } else if (mode === 'up') {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) setMsg(friendlyError(error, 'No se pudo crear la cuenta. Intenta de nuevo.'));
      else if (data.session) { router.push(next); router.refresh(); }
      else {
        setMsgType('ok');
        setMsg('Cuenta creada. Te enviamos un correo de confirmación: abre el enlace que trae para activar tu cuenta (revisa también el spam).');
      }
    } else {
      // mode === 'reset'
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });
      if (error) {
        setMsg(friendlyError(error, 'No se pudo enviar el enlace de recuperación.'));
      } else {
        setMsgType('ok');
        setMsg('Enlace de recuperación enviado. Revisa tu correo electrónico (incluida la carpeta de spam o correo no deseado).');
        setCooldown(60);
      }
    }
    setBusy(false);
  }

  return (
    <div className="wrap">
      <Topbar badge="ACCESO" subtitle="← Ir al inicio" hideAuthAction />

      <div className="authgrid">
        <div className="authpromo">
          <div className="eyebrow">Toma de Decisiones Multicriterio</div>
          <h2>Tu modelo, tus expertos, tu ranking.</h2>
          <ul>
            <li>Crea proyectos con tus propios criterios y alternativas, sin límite fijo.</li>
            <li>Elige entre 7 métodos y pesa los criterios con expertos (AHP) o con los datos (CRITIC, Entropía).</li>
            <li>Invita a tus expertos con un enlace: ellos no necesitan cuenta.</li>
            <li>Exporta a Excel con fórmulas vivas o genera el informe ejecutivo.</li>
          </ul>
          <p className="muted" style={{ fontSize: 13 }}><Link href="/tutorial">Ver el paso a paso completo →</Link></p>
        </div>

        <div className="authcard">
          <div>
            <div className="eyebrow">
              {mode === 'in' ? 'Bienvenido de vuelta' : mode === 'up' ? 'Empecemos' : 'Seguridad de la cuenta'}
            </div>
            <h1>
              {mode === 'in' ? 'Iniciar sesión' : mode === 'up' ? 'Crear cuenta' : 'Recuperar contraseña'}
            </h1>
            {mode === 'reset' && (
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                Ingresa tu correo y te enviaremos un enlace seguro para restablecer el acceso a tu cuenta.
              </p>
            )}
          </div>
          {aviso && (
            <div className={'banner' + (aviso.tone === 'info' ? ' info' : '')} role="status" style={{ fontSize: 13.5 }}>
              <span><b>{aviso.title}</b> {aviso.text}</span>
            </div>
          )}
          {!supabaseConfigurado && <div className="banner"><span><b>Falta configurar Supabase.</b> Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README).</span></div>}
          <form className="card form" onSubmit={submit}>
            {mode === 'up' && <div><label className="lbl" htmlFor="n">Nombre completo</label><input id="n" type="text" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ej.: Ana Pérez" /></div>}
            <div>
              <label className="lbl" htmlFor="e">Correo electrónico</label>
              <input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="tu-correo@universidad.edu.co" />
            </div>
            {mode !== 'reset' && (
              <div>
                <div className="pwhead">
                  <label className="lbl" htmlFor="p" style={{ margin: 0 }}>Contraseña</label>
                  {mode === 'in' && (
                    <button type="button" className="linkbtn" onClick={() => { setMode('reset'); setMsg(''); }}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <div className="pwfield">
                  <input id="p" type={showPw ? 'text' : 'password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Mínimo 8 caracteres" aria-describedby={mode === 'up' ? 'pwhelp' : undefined} />
                  <button type="button" className="pwtoggle" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw} aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {showPw ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                {mode === 'up' && <p id="pwhelp" className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Usa al menos 8 caracteres.</p>}
              </div>
            )}
            {msg && (
              <div className={msgType === 'ok' ? 'banner info' : 'banner'} role="alert" style={{ margin: 0, fontSize: 13.5 }}>
                <span><b>{msgType === 'ok' ? 'Listo:' : 'Error:'}</b> {msg}</span>
              </div>
            )}
            <button className="btn primary" type="submit" disabled={busy || (mode === 'reset' && cooldown > 0)}>
              {busy
                ? 'Un momento…'
                : mode === 'reset' && cooldown > 0
                  ? `Reenviar en ${cooldown}s`
                  : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Crear cuenta' : 'Enviar enlace de recuperación'}
            </button>
          </form>

          {mode === 'reset' ? (
            <button className="btn" type="button" onClick={() => { setMode('in'); setMsg(''); }}>
              ← Volver al inicio de sesión
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
              {mode === 'in' ? 'No tengo cuenta: crear una' : 'Ya tengo cuenta: entrar'}
            </button>
          )}

          <p className="muted" style={{ fontSize: 13 }}>¿Eres experto y te compartieron un enlace? No necesitas cuenta: ábrelo directamente.</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
