import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { frameHeaders } from '@/lib/frame';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  // Solo `/p/<token>/embed` puede ser enmarcada por otros sitios; el resto, únicamente desde este origen.
  for (const [k, v] of Object.entries(frameHeaders(request.nextUrl.pathname))) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
