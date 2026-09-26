import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: 'linear-gradient(135deg, #0284C7 0%, #00E5FF 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.35)' }} />
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.7)' }} />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.35)' }} />
          <div style={{ width: 44, height: 44, borderRadius: 14, background: '#FFFFFF' }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
