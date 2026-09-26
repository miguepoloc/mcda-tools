'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Iniciales para el avatar: una letra por cada trozo del usuario del correo («ana.munoz@…» → AM, «miguepoloc@…» → M). */
const initials = (email: string) =>
  (email.split('@')[0].split(/[._\-+]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || email[0] || '?').toUpperCase();

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

/** Menú de la sesión: avatar + correo + flecha (se ve que es un botón) que abre «Mi cuenta» y «Salir», con «Salir» separado
 * de lo demás. Sustituye al correo suelto que enlazaba a /cuenta sin que nadie lo notara. Teclado: Enter/Espacio/↓ abren,
 * ↑↓/Inicio/Fin recorren, Escape cierra y devuelve el foco al botón; también cierra al hacer clic fuera o al navegar. */
export default function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const away = (e: MouseEvent | TouchEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="umenu" ref={wrap}>
      <button
        ref={btn} type="button" className="umenu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-menu`}
        aria-label={`Menú de la cuenta de ${email}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        <span className="umenu-avatar" aria-hidden="true">{initials(email)}</span>
        <span className="umenu-email">{email}</span>
        <svg className="umenu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div id={`${id}-menu`} className="umenu-pop" role="menu" aria-label="Cuenta" onKeyDown={onMenuKey}>
          <div className="umenu-head" role="none">
            <span className="muted">Sesión iniciada como</span>
            <span className="mono">{email}</span>
          </div>
          <Link href="/cuenta" role="menuitem" className="umenu-item" aria-current={pathname === '/cuenta' ? 'page' : undefined} onClick={() => setOpen(false)}>
            <Icon d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />Mi cuenta
          </Link>
          <div className="umenu-sep" role="separator" />
          <button type="button" role="menuitem" className="umenu-item danger" onClick={() => void signOut()}>
            <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />Salir
          </button>
        </div>
      )}
    </div>
  );
}
