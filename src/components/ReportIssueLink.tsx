'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { buildIssueUrl } from '@/lib/report-issue';

/** Enlace a «nuevo issue» de GitHub con versión, ruta y método del proyecto (si hay uno abierto).
 * El método lo publica `ProjectWorkspace` en `document.body.dataset.mcdaMethod`; nunca se envía ningún id ni token. */
export default function ReportIssueLink({ className, role, children, onClick }: { className?: string; role?: string; children?: ReactNode; onClick?: () => void }) {
  const pathname = usePathname();
  const [href, setHref] = useState(() => buildIssueUrl({ path: pathname ?? '/' }));
  const refresh = () => {
    const method = typeof document !== 'undefined' ? document.body.dataset.mcdaMethod : undefined;
    setHref(buildIssueUrl({ path: pathname ?? '/', method }));
  };
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer" className={className} role={role}
      onMouseEnter={refresh} onFocus={refresh} onTouchStart={refresh}
      onClick={(e) => {
        // el href de React puede ir un render atrasado: se abre con el método ya leído
        e.preventDefault();
        const method = document.body.dataset.mcdaMethod;
        window.open(buildIssueUrl({ path: pathname ?? '/', method }), '_blank', 'noopener,noreferrer');
        onClick?.();
      }}
    >
      {children ?? 'Reportar un problema'}
    </a>
  );
}
