// Insignia de método y botón «Compartir»: etiquetas, enlace público, código para incrustar y frases de visibilidad.
import { embedCode, methodBadge, methodTitle, publicSees, publicUrl, shareBlurb, shareStateText, METHOD_VAR } from '../src/lib/shareUi.ts';
import { METHOD_GUIDE, METHOD_ORDER } from '../src/lib/methodGuide.ts';

let fails = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) { fails++; console.error('FALLA', n, e); } else console.log('ok   ', n, e); };

for (const m of METHOD_ORDER) {
  const b = methodBadge(m);
  ok(`insignia ${m}: nombre, familia, color y frase`, b.label === METHOD_GUIDE[m].label && b.family.length > 0 && b.color.startsWith('var(--m-') && b.what.length > 20 && b.color === METHOD_VAR[m]);
}
ok('familia legible de TOPSIS', methodBadge('topsis').family === 'Distancia al ideal');
ok('colores distintos por método', new Set(METHOD_ORDER.map((m) => methodBadge(m).color)).size === METHOD_ORDER.length);
ok('título «Resultados · TOPSIS»', methodTitle('Resultados', 'topsis') === 'Resultados · TOPSIS');
ok('título «Comparativa · Fuzzy TOPSIS»', methodTitle('Comparativa', 'fuzzy_topsis') === 'Comparativa · Fuzzy TOPSIS');
ok('enlace público', publicUrl('https://mcda.tools', 'abc123') === 'https://mcda.tools/p/abc123');
const emb = embedCode('https://mcda.tools/p/abc', 'Mi "proyecto" <x>');
ok('iframe escapa el título', emb.startsWith('<iframe src="https://mcda.tools/p/abc"') && emb.includes('&quot;proyecto&quot;') && emb.includes('&lt;x&gt;') && !emb.includes('<x>'));
ok('estado privado/público', shareStateText(false, 'decision').label === 'Privado' && shareStateText(true, 'decision').label === 'Público');
ok('estado público de mapa menciona mapa', shareStateText(true, 'spatial').detail.includes('mapa'));
const dec = publicSees({ kind: 'decision', method: 'ahp', objectiveWeights: false });
ok('AHP: consistencia y sin matriz', dec.sees.some((s) => s.includes('consistentes')) && !dec.sees.some((s) => s.includes('matriz de decisión')));
const top = publicSees({ kind: 'decision', method: 'topsis', objectiveWeights: true, weightsLabel: 'CRITIC' });
ok('TOPSIS+CRITIC: matriz, pesos objetivos y juicios ocultos', top.sees.some((s) => s.includes('matriz de decisión')) && top.sees.some((s) => s.includes('CRITIC')) && top.hidden.some((s) => s.includes('juicios')));
ok('nunca expone expertos', [dec, top, publicSees({ kind: 'spatial', method: 'ahp', objectiveWeights: false })].every((r) => r.hidden.some((s) => s.includes('expertos'))));
ok('frases sin la jerga antigua', !top.sees.concat(top.hidden).join(' ').includes('no se muestran ni cuentan'));
ok('bajada por tipo', shareBlurb('spatial').includes('mapa') && shareBlurb('decision').includes('ranking'));
if (fails) { console.error(fails + ' fallas'); process.exit(1); }
