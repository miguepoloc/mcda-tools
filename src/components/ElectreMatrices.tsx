import { EPS, type ElectreResult } from '@/lib/electre';
import ElectrePairTable from './ElectrePairTable';
import { fmtVs } from './calc/calcFormat';

const mark = (ok: boolean) => (ok ? '✓' : '✗');

/** Las tres matrices de ELECTRE con cada celda marcada según cumpla o no su condición: concordancia ≥ c*, discordancia ≤ d* y,
 * para que la fila SUPERE a la columna, las dos a la vez. Cada celda lleva ✓/✗ además del color, así que se lee sin depender de él.
 * La tercera matriz dice también cuál condición falla (c, d o ambas): es lo que explica por qué dos alternativas quedan incomparables. */
export default function ElectreMatrices({ names, result, mode = 'screen', headings = true }: { names: string[]; result: ElectreResult; /** 'report': la tabla par por par va abierta (un <details> cerrado no se imprime). */ mode?: 'screen' | 'report'; /** false: sin los títulos «Matriz C/D/resultado» (cuando el paso que lo contiene ya los rotula). */ headings?: boolean }) {
  const { concordance, discordance, outranks, cStar, dStar } = result;
  // misma tolerancia que electre(): un c que coincide con c* «por redondeo» cuenta como cumplido
  const cOk = (i: number, k: number) => concordance[i][k] >= cStar - EPS;
  const dOk = (i: number, k: number) => discordance[i][k] <= dStar + EPS;

  const Grid = ({ cell }: { cell: (i: number, k: number) => { text: string; ok: boolean | null; title: string } }) => (
    <div className="tbl" style={{ marginTop: 8 }}>
      <table className="em">
        <thead><tr><th><span className="sr-only">Fila supera a columna</span></th>{names.map((x) => <th key={x} className="n">{x}</th>)}</tr></thead>
        <tbody>
          {names.map((row, i) => (
            <tr key={row}>
              <th scope="row" className="alt">{row}</th>
              {names.map((col, k) => {
                if (i === k) return <td key={col} className="n em-diag" title="Una alternativa no se compara consigo misma">—</td>;
                const c = cell(i, k);
                return <td key={col} className={'n ' + (c.ok ? 'em-ok' : 'em-no')} title={c.title}><span className="mono">{c.text}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <p className="muted" style={{ fontSize: 13, margin: '4px 0 0', maxWidth: '78ch' }}>
        Una fila <b>supera</b> a una columna solo si se cumplen <b>las dos</b> condiciones: la concordancia llega a c* <i>y</i> la discordancia no pasa de d*.
        <span className="em-key"><span className="em-ok">✓ cumple</span><span className="em-no">✗ no cumple</span></span>
      </p>

      {headings && <h4>Matriz C, concordancia: ¿cuántos criterios (con su peso) dicen «la fila es al menos tan buena»? Cumple si ≥ {cStar.toFixed(2)}</h4>}
      <Grid cell={(i, k) => ({ text: `${mark(cOk(i, k))} ${fmtVs(concordance[i][k], cStar, 'c')}`, ok: cOk(i, k), title: `${names[i]} → ${names[k]}: concordancia ${concordance[i][k].toFixed(4)} ${cOk(i, k) ? '≥' : '<'} c* ${cStar.toFixed(2)}` })} />

      {headings && <h4>Matriz D, discordancia: ¿qué tan fuerte es la mayor objeción contra la fila? Cumple si ≤ {dStar.toFixed(2)}</h4>}
      <Grid cell={(i, k) => ({ text: `${mark(dOk(i, k))} ${fmtVs(discordance[i][k], dStar, 'd')}`, ok: dOk(i, k), title: `${names[i]} → ${names[k]}: discordancia ${discordance[i][k].toFixed(4)} ${dOk(i, k) ? '≤' : '>'} d* ${dStar.toFixed(2)}` })} />

      {headings && <h4>Resultado: la fila supera a la columna (✓) solo si cumple C y D</h4>}
      <Grid cell={(i, k) => {
        const failed = [!cOk(i, k) ? 'c' : '', !dOk(i, k) ? 'd' : ''].filter(Boolean);
        return {
          text: outranks[i][k] ? '✓ supera' : `✗ falla ${failed.join(' y ')}`,
          ok: outranks[i][k],
          title: outranks[i][k] ? `${names[i]} supera a ${names[k]}` : `${names[i]} no supera a ${names[k]}: no cumple ${failed.map((f) => (f === 'c' ? 'la concordancia' : 'la discordancia')).join(' ni ')}`,
        };
      }} />

      {mode === 'report' ? (
        <div style={{ marginTop: 14 }}>
          <h4>Los mismos pares, uno por uno</h4>
          <ElectrePairTable names={names} result={result} />
        </div>
      ) : (
        <details style={{ marginTop: 14 }}>
          <summary>Ver la misma información par por par</summary>
          <ElectrePairTable names={names} result={result} />
        </details>
      )}
    </>
  );
}
