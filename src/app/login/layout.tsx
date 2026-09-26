import type { Metadata } from 'next';

// La página es un componente de cliente (no puede exportar `metadata`), así que el título va en el layout.
export const metadata: Metadata = { title: 'Entrar o crear cuenta · Plataforma MCDA' };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
