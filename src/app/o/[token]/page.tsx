import OpenJoin from '@/components/OpenJoin';

export default async function OpenJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OpenJoin token={token} />;
}
