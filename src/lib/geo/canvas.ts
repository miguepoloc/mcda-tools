/** Utilidades de canvas del geovisor (solo navegador). */
import { gather, type OverlayMap } from './overlay.ts';

/** Reproyecta `rgba` (grilla) a la imagen del mapa y la deja en un canvas. */
export function toCanvas(map: OverlayMap, rgba: Uint32Array): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = map.width; cv.height = map.height;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(map.width, map.height);
  img.data.set(new Uint8ClampedArray(gather(map, rgba).buffer));
  ctx.putImageData(img, 0, 0);
  return cv;
}
export const toUrl = (map: OverlayMap, rgba: Uint32Array) => toCanvas(map, rgba).toDataURL('image/png');

export function saveBytes(name: string, bytes: Uint8Array | string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const canvasBytes = (cv: HTMLCanvasElement) => new Promise<Uint8Array>((res, rej) => cv.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('No se pudo generar el PNG'))), 'image/png'));
