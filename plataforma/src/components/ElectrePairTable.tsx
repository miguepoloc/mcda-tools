import { EPS, type ElectreResult } from '@/lib/electre';
import { fmtVs } from './calc/calcFormat';

const cell = { padding: '7px 10px', borderBottom: '1px solid var(--line)' } as const;
const head = { padding: '7px 10px', textAlign: 'left', borderBottom: '2px solid var(--line)', fontWeight: 700 } as const;
const yn = (ok: boolean) => (ok ? 'Sí' : 'No');

/** Una fila por par ordenado (a → b), como en la diapositiva del curso: concordancia c(a,b), si llega a c*, discordancia d(a,b), si no
 * pasa de d* y, cruzando las dos, si a supera a b. Las filas donde a supera a b van resaltadas y en negrita, y el resultado está escrito
 * («Sí» / «No»), así que se lee también sin color y en papel. Con muchas alternativas la lista completa es larga: `onlyOutranking`
 * deja solo los pares donde hay superación. Los colores salen de variables CSS (--ink, --line, --pass…) que el informe redefine. */
export default function ElectrePairTable({ names, result, onlyOutranking = false }: { names: string[]; result: ElectreResult; onlyOutranking?: boolean }) {
  const { concordance, discordance, outranks, cStar, dStar } = result;
  const pairs: { i: number; k: number; cOk: boolean; dOk: boolean; win: boolean }[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let k = 0; k < names.length; k++) {
      if (i === k) continue;
      const win = !!outranks[i]?.[k];
      if (onlyOutranking && !win) continue;
      pairs.push({ i, k, cOk: concordance[i][k] >= cStar - EPS, dOk: discordance[i][k] <= dStar + EPS, win });
    }
  }
  return (
    <table className="rpt-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
      <caption className="sr-only">Cada par de alternativas con su concordancia, su discordancia y si la primera supera a la segunda</caption>
      <thead>
        <tr>
          <th style={head}>Par (a → b)</th>
          <th style={{ ...head, textAlign: 'right' }}>c(a, b)</th>
          <th style={{ ...head, textAlign: 'center' }}>¿c ≥ {cStar.toFixed(2)}?</th>
          <th style={{ ...head, textAlign: 'right' }}>d(a, b)</th>
          <th style={{ ...head, textAlign: 'center' }}>¿d ≤ {dStar.toFixed(2)}?</th>
          <th style={{ ...head, textAlign: 'center' }}>¿a supera a b?</th>
        </tr>
      </thead>
      <tbody>
        {pairs.length === 0 && <tr><td colSpan={6} style={{ ...cell, color: 'var(--muted)' }}>Ningún par cumple las dos condiciones con estos umbrales.</td></tr>}
        {pairs.map(({ i, k, cOk, dOk, win }) => (
          <tr key={`${i}-${k}`} style={{ background: win ? 'color-mix(in srgb, var(--pass) 18%, var(--surface))' : undefined, fontWeight: win ? 700 : 400 }}>
            <td style={cell}>{names[i]} → {names[k]}</td>
            <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--f-mono, monospace)' }}>{fmtVs(concordance[i][k], cStar, 'c')}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{yn(cOk)}</td>
            <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--f-mono, monospace)' }}>{fmtVs(discordance[i][k], dStar, 'd')}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{yn(dOk)}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{yn(win)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
