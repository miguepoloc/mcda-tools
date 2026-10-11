import OpenJoin from '@/components/OpenJoin';

export const metadata = { title: 'Inscripción de expertos · Plataforma MCDA'};

export default async function OpenJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OpenJoin token={token} />;
}
