/** Isotipo oficial: Matriz de Decisión y Vértice Óptimo
 * Representa una cuadrícula de criterios/alternativas con la alternativa ideal destacada en gradiente Cyan/Indigo. */
export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx="8" fill="url(#mcda-logo-grad)" />
      <rect x="6" y="6" width="8" height="8" rx="2.2" fill="#FFFFFF" fillOpacity="0.32" />
      <rect x="18" y="6" width="8" height="8" rx="2.2" fill="#FFFFFF" fillOpacity="0.65" />
      <rect x="6" y="18" width="8" height="8" rx="2.2" fill="#FFFFFF" fillOpacity="0.32" />
      <rect x="18" y="18" width="8" height="8" rx="2.5" fill="#FFFFFF" />
      <circle cx="22" cy="22" r="2.2" fill="#0284C7" />
      <defs>
        <linearGradient id="mcda-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0284C7" />
          <stop offset="1" stopColor="#00E5FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}
