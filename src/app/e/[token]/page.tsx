import ExpertFlow from '@/components/ExpertFlow';

export default async function ExpertPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ExpertFlow token={token} />;
}
