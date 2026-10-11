import type { Metadata } from 'next';
import './globals.css';

// Base para las URL absolutas de Open Graph/Twitter (WhatsApp y redes no resuelven rutas relativas).
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mcda.tools').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Plataforma MCDA',
  description: 'Toma de decisiones multicriterio: AHP, TOPSIS, VIKOR, PROMETHEE, ELECTRE, SAW y Fuzzy TOPSIS, con pesos por expertos, CRITIC o Entropía, geovisor AHP+SIG e informe exportable.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
