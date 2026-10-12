import type { Metadata } from 'next';
import './globals.css';
// Modo presentación (U4): va después de globals.css para ganar por orden con la misma especificidad.
import './present.css';
import { PRESENT_BOOT_SCRIPT } from '@/lib/present';

// Base para las URL absolutas de Open Graph/Twitter (WhatsApp y redes no resuelven rutas relativas).
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcda.tools').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Plataforma MCDA',
  description: 'Toma de decisiones multicriterio: AHP, TOPSIS, VIKOR, PROMETHEE, ELECTRE, SAW y Fuzzy TOPSIS, con pesos por expertos, CRITIC o Entropía, geovisor AHP+SIG e informe exportable.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script de arranque puede añadir data-present al <html> antes de hidratar.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el modo presentación guardado antes del primer pintado (sin parpadeo). Texto fijo, sin datos del usuario. */}
        <script dangerouslySetInnerHTML={{ __html: PRESENT_BOOT_SCRIPT }} />
      </head>
      <body>
        {/* WCAG 2.4.1: primer elemento enfocable; lleva directo al contenido, sin recorrer el encabezado. */}
        <a className="skip-link" href="#contenido">Saltar al contenido</a>
        <main id="contenido" tabIndex={-1}>{children}</main>
      </body>
    </html>
  );
}
