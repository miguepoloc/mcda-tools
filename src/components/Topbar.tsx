'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Logo from './Logo';
import UserMenu from './UserMenu';

const NAV_LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/metodo', label: '¿Qué método uso?' },
  { href: '/tutorial', label: 'Cómo funciona' },
];

/** Barra superior compartida por TODAS las páginas: mismo logo, misma navegación (Inicio / ¿Qué
 * método uso? / Cómo funciona) y el mismo control de sesión a la derecha en todas partes, sin
 * excepción — entra a `/login` si no hay sesión; si la hay, «Mis proyectos» + el menú de la cuenta (`UserMenu`: Mi cuenta / Salir).
 * `children` puede agregar algo propio de la página ANTES de ese control (una insignia, un dato de
 * contexto), pero nunca lo reemplaza: si una página cambiara ese bloque, se vería distinta a las demás,
 * que es justo lo que este componente existe para evitar. `showNav`/`hideAuthAction` lo apagan solo
 * para flujos anónimos por token (experto, vista pública) donde no aplica o distraería de la tarea. */
export default function Topbar({
  badge,
  subtitle,
  href = '/',
  title = 'Plataforma MCDA · Inicio',
  loggedIn = false,
  userEmail,
  showNav = true,
  hideAuthAction = false,
  children,
}: {
  badge: string;
  subtitle: string;
  href?: string;
  title?: string;
  loggedIn?: boolean;
  userEmail?: string;
  showNav?: boolean;
  hideAuthAction?: boolean;
  children?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <Link className="brand" href={href} title={title}>
        <Logo size={26} />
        <div>
          <div className="brand-row">
            <span>Plataforma MCDA</span>
            <span className="brand-badge">{badge}</span>
          </div>
          <span className="brand-sub">{subtitle}</span>
        </div>
      </Link>

      <div className="topbar-right">
        {showNav && (
          <nav className="topbar-nav" aria-label="Navegación principal">
            {NAV_LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link key={l.href} href={l.href} className={'navlink' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="topbar-actions">
          {children}
          {!hideAuthAction && (loggedIn ? (
            <div className="user">
              {pathname !== '/dashboard' && <Link className="btn sm" href="/dashboard">Mis proyectos</Link>}
              {userEmail && <UserMenu email={userEmail} />}
            </div>
          ) : (
            <Link className="btn sm primary" href="/login">Entrar o crear cuenta</Link>
          ))}
        </div>
      </div>
    </header>
  );
}
