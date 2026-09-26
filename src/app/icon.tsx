import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #0284C7 0%, #00E5FF 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          padding: 5,
        }}
      >
        <div style={{ display: 'flex', gap: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }} />
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.7)' }} />
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.35)' }} />
          <div style={{ width: 8, height: 8, borderRadius: 2.5, background: '#FFFFFF' }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
