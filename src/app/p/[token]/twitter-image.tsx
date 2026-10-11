import { ogCard } from '@/lib/ogCard';

export const alt = 'Vista previa del enlace público de la Plataforma MCDA';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return ogCard(token);
}
