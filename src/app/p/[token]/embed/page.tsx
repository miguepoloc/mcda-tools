import type { Metadata } from 'next';
import EmbedView from '@/components/EmbedView';
import { parseEmbedParams } from '@/lib/embed';

// Vista pensada para vivir dentro de un <iframe> ajeno: no se indexa y no lleva cabecera ni pie de la plataforma.
export const metadata: Metadata = { title: 'Mapa MCDA', robots: { index: false, follow: false } };

export default async function EmbedPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  return <EmbedView token={token} initial={parseEmbedParams(sp)} />;
}
