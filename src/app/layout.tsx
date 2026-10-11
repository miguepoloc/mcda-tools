import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Plataforma MCDA',
  description: 'Toma de decisiones multicriterio: AHP, TOPSIS, VIKOR, PROMETHEE, ELECTRE, SAW y Fuzzy TOPSIS, con pesos por expertos, CRITIC o Entropía, geovisor AHP+SIG e informe exportable.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* WCAG 2.4.1: primer elemento enfocable; lleva directo al contenido, sin recorrer el encabezado. */}
        <a className="skip-link" href="#contenido">Saltar al contenido</a>
        <main id="contenido" tabIndex={-1}>{children}</main>
      </body>
    </html>
  );
}
