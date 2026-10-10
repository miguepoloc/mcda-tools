/** PDF mínimo de una página con una imagen JPEG a toda la lámina (sin dependencias). El repo no trae una librería de PDF
 * (el informe ejecutivo usa la impresión del navegador); para el mapa compuesto basta una imagen en página A4, que además
 * conserva la resolución elegida. Puro: recibe los bytes del JPEG y devuelve los del PDF. */

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 28;

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);
/** Cadena PDF en UTF-16BE hexadecimal (admite tildes y ñ en el título). */
function pdfText(s: string): string {
  let h = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp > 0xffff) { const v = cp - 0x10000; h += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); }
    else h += cp.toString(16).padStart(4, '0');
  }
  return `<${h}>`;
}
const num = (x: number) => (Math.round(x * 100) / 100).toString();

/** `widthPx`/`heightPx` = tamaño del JPEG. La página es A4 vertical u horizontal según la forma de la imagen. */
export function jpegToPdf(jpeg: Uint8Array, widthPx: number, heightPx: number, opts: { title?: string } = {}): Uint8Array {
  const landscape = widthPx >= heightPx;
  const pw = landscape ? A4.h : A4.w, ph = landscape ? A4.w : A4.h;
  const maxW = pw - 2 * MARGIN, maxH = ph - 2 * MARGIN;
  const k = Math.min(maxW / widthPx, maxH / heightPx);
  const iw = widthPx * k, ih = heightPx * k;
  const ix = (pw - iw) / 2, iy = (ph - ih) / 2;
  const content = `q ${num(iw)} 0 0 ${num(ih)} ${num(ix)} ${num(iy)} cm /Im0 Do Q`;

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array) => { parts.push(b); len += b.length; };
  const obj = (n: number, body: (Uint8Array | string)[]) => {
    offsets[n] = len;
    push(bytes(`${n} 0 obj\n`));
    for (const p of body) push(typeof p === 'string' ? bytes(p) : p);
    push(bytes('\nendobj\n'));
  };

  push(bytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pw)} ${num(ph)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  obj(5, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  obj(6, [`<< /Title ${pdfText(opts.title ?? 'Mapa')} /Producer (MCDA Tools) >>`]);
  const xref = len;
  let x = `xref\n0 7\n0000000000 65535 f \n`;
  for (let n = 1; n <= 6; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  x += `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(bytes(x));

  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
