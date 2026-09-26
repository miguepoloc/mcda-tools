import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
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
