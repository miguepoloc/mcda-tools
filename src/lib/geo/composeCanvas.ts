/** Dibujo de la composición de mapa sobre canvas (solo navegador). Toda la geometría y los textos salen de `compose.ts`;
 * aquí solo se pinta. No lee el mapa de Leaflet: renderiza desde el estado del proyecto que le pasa quien llama. */
import {
  directionLine, footerLines, frameLayout, geomPaths, legendRows, metersPerPixel, niceScale, pickZoom, planComposition,
  project, fitView, tilesFor, unrankedNote, wrapLines, splitPoints,
  type ComposeAvailability, type ComposeOptions, type ComposePoint, type FooterInput, type LegendClassInput, type MapView, type Rect,
} from './compose.ts';
import type { Bounds } from './grid.ts';
import type { FC } from './vector.ts';

export type ComposeInputs = {
  bounds: Bounds;
  /** Imagen del resultado en proyección Mercator que cubre `bounds` (la de `toCanvas(om, paintResult(...))`). */
  result: HTMLCanvasElement | null;
  basemap: { url: string; attr: string; maxZoom: number; subdomains?: string } | null;
  references: { id: string; name: string; fc: FC; color: string; weight: number }[];
  zones: { name: string; fc: FC; fills: (string | null)[]; labels: (string | null)[] } | null;
  points: ComposePoint[];
  legend: LegendClassInput;
  /** Color hex por código de clase (1..N) y 0 = exclusión. */
  classColors: Record<number, string>;
  /** Paradas de la rampa 0→100 en CSS (de índice bajo a alto), para la vista continua. */
  rampStops: string[];
  texts: { legendTitle: string; lowEnd: string; highEnd: string; direction: 'suitability' | 'risk'; zoneRampTitle: string };
  footer: Omit<FooterInput, 'basemapAttr' | 'date'>;
};

const INK = '#0F172A', MUTED = '#475569', LINE = '#CBD5E1';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function loadImage(url: string, timeoutMs = 15000): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => { img.src = ''; res(null); }, timeoutMs);
    img.onload = () => { clearTimeout(t); res(img); };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = url;
  });
}

const scratch = () => document.createElement('canvas').getContext('2d')!;

/** Dibuja (o solo mide, con `dry`) la columna de la leyenda. Devuelve el alto usado en px. */
function drawLegend(ctx: CanvasRenderingContext2D, r: Rect, s: number, o: ComposeOptions, inp: ComposeInputs, dry: boolean): number {
  let y = r.y;
  const f = (px: number, w = 400) => { ctx.font = `${w} ${px * s}px ${FONT}`; };
  const text = (t: string, x: number, yy: number, color = INK) => { if (!dry) { ctx.fillStyle = color; ctx.fillText(t, x, yy); } };
  const para = (t: string, x: number, px: number, w: number, color = INK, weight = 400, maxW = r.w - (x - r.x)) => {
    f(px, weight);
    const lines = wrapLines(t, maxW, (q) => ctx.measureText(q).width);
    for (const ln of lines) { y += px * 1.25 * s; text(ln, x, y, color); }
    return lines.length;
  };
  ctx.textBaseline = 'alphabetic';
  const sw = 16 * s, gap = 8 * s;

  para(inp.texts.legendTitle, r.x, 17, r.w, INK, 700);
  y += 4 * s;
  para(directionLine(inp.texts.direction), r.x, 12, r.w, MUTED);
  y += 12 * s;

  if (o.result) {
    if (o.style === 'classes') {
      for (const row of legendRows(inp.legend)) {
        const tx = r.x + sw + gap;
        const top = y;
        if (!dry) { ctx.fillStyle = inp.classColors[row.code] ?? '#9CA3AF'; ctx.fillRect(r.x, top + 4 * s, sw, sw); ctx.strokeStyle = 'rgba(15,23,42,.45)'; ctx.lineWidth = s; ctx.strokeRect(r.x, top + 4 * s, sw, sw); }
        const head = row.range ? `${row.label} (${row.range})` : row.label;
        para(head, tx, 13, r.w, INK, 600, r.w - sw - gap);
        para(row.value, tx, 12, r.w, MUTED, 400, r.w - sw - gap);
        y += 7 * s;
      }
    } else {
      y += 4 * s;
      if (!dry) {
        const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
        inp.rampStops.forEach((c, i) => g.addColorStop(inp.rampStops.length > 1 ? i / (inp.rampStops.length - 1) : 0, c));
        ctx.fillStyle = g; ctx.fillRect(r.x, y, r.w, 14 * s); ctx.strokeStyle = 'rgba(15,23,42,.45)'; ctx.strokeRect(r.x, y, r.w, 14 * s);
      }
      y += 14 * s;
      f(11); y += 15 * s;
      text(inp.texts.lowEnd, r.x, y, MUTED);
      if (!dry) { const hw = ctx.measureText(inp.texts.highEnd).width; ctx.fillStyle = MUTED; ctx.fillText(inp.texts.highEnd, r.x + r.w - hw, y); }
      y += 10 * s;
      const ex = legendRows(inp.legend).find((x) => x.kind === 'exclusion');
      if (ex) {
        const tx = r.x + sw + gap;
        if (!dry) { ctx.fillStyle = inp.classColors[0] ?? '#9CA3AF'; ctx.fillRect(r.x, y + 4 * s, sw, sw); }
        para(`${ex.label} · ${ex.value}`, tx, 12, r.w, INK, 500, r.w - sw - gap);
      }
    }
  }

  const extra: [string, () => void][] = [];
  if (o.zones && inp.zones) {
    extra.push([`${inp.texts.zoneRampTitle}: ${inp.zones.name}`, () => {
      if (dry) return;
      const g = ctx.createLinearGradient(r.x, 0, r.x + r.w * 0.5, 0);
      inp.rampStops.forEach((c, i) => g.addColorStop(inp.rampStops.length > 1 ? i / (inp.rampStops.length - 1) : 0, c));
      ctx.fillStyle = g; ctx.fillRect(r.x, y + 2 * s, r.w * 0.5, 9 * s);
    }]);
  }
  for (const ref of inp.references.filter((x) => o.referenceIds.includes(x.id))) {
    extra.push([`${ref.name} (contorno)`, () => { if (!dry) { ctx.strokeStyle = ref.color; ctx.lineWidth = Math.max(2, ref.weight * s); ctx.beginPath(); ctx.moveTo(r.x, y + 6 * s); ctx.lineTo(r.x + sw, y + 6 * s); ctx.stroke(); } }]);
  }
  if (extra.length || (o.points && inp.points.length)) y += 8 * s;
  for (const [label, mark] of extra) {
    y += 2 * s; mark();
    para(label, r.x + sw + gap, 12, r.w, INK, 500, r.w - sw - gap);
  }
  if (o.points && inp.points.length) {
    const { ranked, unranked } = splitPoints(inp.points);
    if (ranked.length) {
      y += 2 * s;
      if (!dry) { ctx.beginPath(); ctx.arc(r.x + sw / 2, y + 9 * s, 7 * s, 0, Math.PI * 2); ctx.fillStyle = '#64748B'; ctx.fill(); ctx.lineWidth = 2 * s; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      para(`Punto con puesto (${ranked.length}); color = clase donde cae`, r.x + sw + gap, 12, r.w, INK, 500, r.w - sw - gap);
    }
    const note = unrankedNote(unranked.length);
    if (note) {
      y += 2 * s;
      if (!dry) { ctx.beginPath(); ctx.arc(r.x + sw / 2, y + 9 * s, 6 * s, 0, Math.PI * 2); ctx.strokeStyle = '#64748B'; ctx.lineWidth = 2 * s; ctx.stroke(); }
      para(note, r.x + sw + gap, 12, r.w, INK, 500, r.w - sw - gap);
    }
  }
  return y - r.y + 6 * s;
}

function pathPoly(ctx: CanvasRenderingContext2D, rings: number[][][], v: MapView) {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((p, i) => { const [x, y] = project(v, p[0], p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
  }
}

/** Compone la lámina completa. `avail` se calcula a partir de `inputs`; lo no disponible se omite con aviso. */
export async function renderComposition(optsIn: ComposeOptions, inp: ComposeInputs): Promise<{ canvas: HTMLCanvasElement; warnings: string[] }> {
  const avail: ComposeAvailability = { zones: !!inp.zones, references: inp.references.map((r) => ({ id: r.id, name: r.name })), points: inp.points.length, result: !!inp.result };
  const { opts: o, warnings } = planComposition(optsIn, avail);
  const W = o.width, s = W / 1600;
  const m = scratch();

  const footer = footerLines({ ...inp.footer, basemapAttr: o.basemap && inp.basemap ? inp.basemap.attr : null, date: o.date });
  // El alto de la leyenda se mide antes de crear el lienzo; la lámina crece si hace falta (nada se corta).
  const probe = frameLayout(W, inp.bounds, 0);
  const legendNeeded = o.legend ? drawLegend(m, { ...probe.legend, x: 0, y: 0 }, s, o, inp, true) : 0;
  m.font = `700 ${30 * s}px ${FONT}`;
  const titleLines = wrapLines(o.title, W - 2 * probe.pad, (q) => m.measureText(q).width).length;
  m.font = `400 ${17 * s}px ${FONT}`;
  const subLines = o.subtitle.trim() ? wrapLines(o.subtitle, W - 2 * probe.pad, (q) => m.measureText(q).width).length : 0;
  m.font = `400 ${13 * s}px ${FONT}`;
  const footLines = footer.reduce((a, t) => a + wrapLines(t, W - 2 * probe.pad, (q) => m.measureText(q).width).length, 0);
  const L = frameLayout(W, inp.bounds, legendNeeded, titleLines, subLines, footLines);

  const cv = document.createElement('canvas');
  cv.width = L.W; cv.height = Math.round(L.H);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el lienzo.');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.textBaseline = 'alphabetic';

  // --- encabezado
  {
    let y = L.header.y;
    ctx.fillStyle = INK; ctx.font = `700 ${30 * s}px ${FONT}`;
    for (const ln of wrapLines(o.title, L.header.w, (q) => ctx.measureText(q).width)) { y += 34 * s; ctx.fillText(ln, L.header.x, y); }
    if (o.subtitle.trim()) {
      ctx.fillStyle = MUTED; ctx.font = `400 ${17 * s}px ${FONT}`;
      for (const ln of wrapLines(o.subtitle, L.header.w, (q) => ctx.measureText(q).width)) { y += 22 * s; ctx.fillText(ln, L.header.x, y); }
    }
    ctx.fillStyle = INK; ctx.fillRect(L.header.x, L.header.y + L.header.h - 3 * s, L.header.w, 2 * s);
  }

  // --- mapa
  const mp = L.map;
  const view = fitView(inp.bounds, mp.w, mp.h, 0.05);
  ctx.save();
  ctx.beginPath(); ctx.rect(mp.x, mp.y, mp.w, mp.h); ctx.clip();
  ctx.translate(mp.x, mp.y);
  ctx.fillStyle = '#E2E8F0'; ctx.fillRect(0, 0, mp.w, mp.h);

  if (o.basemap && inp.basemap) {
    const z = pickZoom(view, inp.basemap.maxZoom);
    const tiles = tilesFor(view, z, inp.basemap.url, inp.basemap.subdomains ?? 'abc');
    const imgs = await Promise.all(tiles.map((t) => loadImage(t.url)));
    let failed = 0;
    imgs.forEach((img, i) => {
      if (!img) { failed++; return; }
      const t = tiles[i];
      // medio píxel de solape para evitar costuras entre teselas
      ctx.drawImage(img, t.px, t.py, t.size + 0.6, t.size + 0.6);
    });
    if (failed === tiles.length && tiles.length) warnings.push('El mapa base no se pudo cargar (red o bloqueo del navegador): la lámina se compuso sin mapa base.');
    else if (failed) warnings.push(`${failed} de ${tiles.length} teselas del mapa base no cargaron: hay huecos en el fondo.`);
  }

  if (o.result && inp.result) {
    const [x0, y0] = project(view, inp.bounds.west, inp.bounds.north), [x1, y1] = project(view, inp.bounds.east, inp.bounds.south);
    ctx.globalAlpha = o.basemap && inp.basemap ? 0.85 : 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(inp.result, x0, y0, x1 - x0, y1 - y0);
    ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1;
  }

  if (o.zones && inp.zones) {
    inp.zones.fc.features.forEach((f, i) => {
      const p = geomPaths(f.geometry);
      if (!p.rings.length) return;
      pathPoly(ctx, p.rings, view);
      ctx.globalAlpha = 0.6; ctx.fillStyle = inp.zones!.fills[i] ?? '#9CA3AF'; ctx.fill('evenodd'); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(15,23,42,.85)'; ctx.lineWidth = 1.2 * s; ctx.stroke();
    });
    // Rótulos de zona solo si son pocas: más de 40 se vuelven una mancha.
    if (inp.zones.fc.features.length <= 40) {
      ctx.font = `600 ${12 * s}px ${FONT}`; ctx.textAlign = 'center';
      inp.zones.fc.features.forEach((f, i) => {
        const lbl = inp.zones!.labels[i];
        const rings = geomPaths(f.geometry).rings;
        if (!lbl || !rings.length) return;
        const ring = rings.reduce((a, b) => (b.length > a.length ? b : a));
        let sx = 0, sy = 0;
        for (const p of ring) { const [x, y] = project(view, p[0], p[1]); sx += x; sy += y; }
        const cx = sx / ring.length, cy = sy / ring.length;
        ctx.lineWidth = 3 * s; ctx.strokeStyle = '#fff'; ctx.strokeText(lbl, cx, cy);
        ctx.fillStyle = INK; ctx.fillText(lbl, cx, cy);
      });
      ctx.textAlign = 'start';
    }
  }

  for (const ref of inp.references.filter((x) => o.referenceIds.includes(x.id))) {
    ctx.strokeStyle = ref.color; ctx.lineWidth = Math.max(2, ref.weight * s * 1.3); ctx.lineJoin = 'round';
    for (const f of ref.fc.features) {
      const p = geomPaths(f.geometry);
      if (p.rings.length) { pathPoly(ctx, p.rings, view); ctx.stroke(); }
      for (const ln of p.lines) { ctx.beginPath(); ln.forEach((q, i) => { const [x, y] = project(view, q[0], q[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
      ctx.fillStyle = ref.color;
      for (const q of p.points) { const [x, y] = project(view, q[0], q[1]); ctx.beginPath(); ctx.arc(x, y, 4 * s, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  if (o.points && inp.points.length) {
    const r = 8 * s;
    // Sin puesto primero (debajo): hueco gris, sin número. Con puesto encima, con su número.
    const { ranked, unranked } = splitPoints(inp.points);
    for (const p of unranked) {
      const [x, y] = project(view, p.lon, p.lat);
      if (x < -r || y < -r || x > mp.w + r || y > mp.h + r) continue;
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      ctx.lineWidth = 2 * s; ctx.strokeStyle = '#475569'; ctx.stroke();
    }
    for (const p of ranked) {
      const [x, y] = project(view, p.lon, p.lat);
      if (x < -r || y < -r || x > mp.w + r || y > mp.h + r) continue;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
      ctx.lineWidth = 2 * s; ctx.strokeStyle = '#0B0F17'; ctx.stroke();
      if (ranked.length <= 150) {
        const t = String(p.rank);
        ctx.font = `700 ${(t.length > 2 ? 8 : 10) * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#0B0F17'; ctx.strokeText(t, x, y + 0.5 * s);
        ctx.fillStyle = '#fff'; ctx.fillText(t, x, y + 0.5 * s);
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // --- escala gráfica y norte (sobre una tarjeta blanca dentro del mapa)
  if (o.scaleBar) {
    const bar = niceScale(metersPerPixel(view), mp.w * 0.22);
    if (bar.px > 0) {
      const bw = Math.max(bar.px, 60 * s) + 28 * s, bh = 40 * s, bx = 14 * s, by = mp.h - bh - 14 * s;
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = INK; ctx.lineWidth = 2 * s;
      const x0 = bx + 14 * s, yb = by + 26 * s;
      ctx.beginPath(); ctx.moveTo(x0, yb - 7 * s); ctx.lineTo(x0, yb); ctx.lineTo(x0 + bar.px, yb); ctx.lineTo(x0 + bar.px, yb - 7 * s); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = `600 ${12 * s}px ${FONT}`; ctx.fillText('0', x0 - 3 * s, by + 15 * s); ctx.fillText(bar.label, x0 + bar.px - 8 * s, by + 15 * s);
    }
  }
  if (o.northArrow) {
    const cx = mp.w - 34 * s, cy = 54 * s;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(cx - 24 * s, cy - 40 * s, 48 * s, 84 * s);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(cx, cy - 30 * s); ctx.lineTo(cx + 12 * s, cy + 14 * s); ctx.lineTo(cx, cy + 6 * s); ctx.lineTo(cx - 12 * s, cy + 14 * s); ctx.closePath(); ctx.fill();
    ctx.font = `700 ${16 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('N', cx, cy + 34 * s); ctx.textAlign = 'start';
  }
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 2 * s; ctx.strokeRect(mp.x, mp.y, mp.w, mp.h);

  // --- leyenda y pie
  if (o.legend) drawLegend(ctx, L.legend, s, o, inp, false);
  ctx.fillStyle = LINE; ctx.fillRect(L.footer.x, L.footer.y, L.footer.w, s);
  ctx.font = `400 ${13 * s}px ${FONT}`; ctx.fillStyle = MUTED;
  let fy = L.footer.y + 6 * s;
  for (const t of footer) for (const ln of wrapLines(t, L.footer.w, (q) => ctx.measureText(q).width)) { fy += 17 * s; ctx.fillText(ln, L.footer.x, fy); }
  return { canvas: cv, warnings };
}
