import { ImageResponse } from 'next/og';
import { publicSocial } from './publicMeta';

/** Imagen 1200×630 para compartir el enlace público (WhatsApp, redes): tarjeta de marca con el título del proyecto.
 * No dibuja el mapa (render ráster en el servidor no es sencillo); solo título y objetivo, que ya son públicos. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

export async function ogCard(token: string): Promise<ImageResponse> {
  const { info } = await publicSocial(token);
  const title = clip(info?.title ?? 'Plataforma MCDA', 110);
  const kicker = info ? (info.spatial ? 'Mapa de aptitud · AHP + SIG' : 'Toma de decisiones multicriterio') : 'Toma de decisiones multicriterio';
  const sub = info?.objective ? clip(info.objective.replace(/\s+/g, ' ').trim(), 170) : 'AHP, TOPSIS, VIKOR, PROMETHEE, ELECTRE y mapas de aptitud';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: 'linear-gradient(135deg, #0B0F17 0%, #0C2A4A 100%)', color: '#F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #0284C7 0%, #00E5FF 100%)', display: 'flex' }} />
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#A5F3FC' }}>mcda.tools</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', fontSize: 28, color: '#00E5FF', letterSpacing: 1 }}>{kicker}</div>
          <div style={{ display: 'flex', fontSize: title.length > 60 ? 54 : 70, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#94A3B8', lineHeight: 1.3 }}>{sub}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#64748B' }}>Plataforma MCDA · Universidad del Magdalena</div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
