import { RI, SAATY, fmt, pairsOf, type WeightMethod } from '@/lib/ahp';
import { riFor, type AhpBreakdownData, type SheetBreakdown } from '@/lib/ahpBreakdown';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, num, type CalcMode } from './CalcKit';
import AhpProcessSteps from './AhpProcessSteps';

/** Desglose paso a paso del AHP con los números del proyecto, como en las diapositivas 10 a 29 de la Sesión 2 (sin asumir nada): escala de
 * Saaty, matriz de comparación, media geométrica entre expertos, normalizar y promediar, eigenvector y potencias, λmax, CI, RI, CR,
 * consistencia por experto, síntesis y modo ideal. Es una pieza pura: recibe `AhpBreakdownData` (ver `buildAhpBreakdownData` en
 * lib/ahpBreakdown.ts, que solo reúne lo que la plataforma ya calcula) y no calcula nada de los resultados.
 * `mode="screen"`: cada paso es un <details> (la hoja de criterios y la síntesis abiertas); `mode="report"`: todo abierto para imprimir. */
type Props = {
  mode: CalcMode;
  data: AhpBreakdownData;
  /** Mostrar el proceso en 6 pasos y el vocabulario local/global/final (paso A). Por defecto sí. */
  showProcess?: boolean;
  /** Paso(s) del proceso AHP que se marcan «estás aquí» (1 a 6). */
  current?: number | number[];
};

const pct = (x: number, d = 1) => (Number.isFinite(x) ? (x * 100).toFixed(d) + ' %' : '—');
const clip = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const f3 = (x: number) => num(x, 3);
/** Entero tal cual (7), decimal con 3 cifras (0.143): para las sustituciones numéricas. */
const g = (x: number) => (Number.isInteger(x) ? String(x) : num(x, 3));
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (t: number) => String(t).split('').map((d) => SUP[+d]).join('');
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const METHOD_TEXT: Record<WeightMethod, string> = {
  eigenvector: 'eigenvector principal de Saaty (iteración de potencias)',
  mean: 'promedio de columnas normalizadas (el procedimiento a mano del curso)',
};
/** Encabezado de una lista de nombres con sus posiciones ordenadas por peso (para frases «Qué dice tu caso»). */
const topByWeight = (items: { name: string }[], w: number[]) => w.map((x, i) => ({ i, x, name: items[i]?.name ?? '' })).sort((a, b) => b.x - a.x);

/** Barras de peso propias (variables CSS, valor escrito al final de cada barra: nada depende solo del color). */
function WeightBars({ names, w, caption }: { names: string[]; w: number[]; caption: string }) {
  const max = Math.max(...w, 1e-9) * 1.1;
  return (
    <div className="ahp-wbars" role="group" aria-label={caption}>
      <div className="ahp-wbars-cap">{caption}</div>
      {names.map((n, i) => (
        <div className="ahp-wbars-row" key={i}>
          <span className="ahp-wbars-nm">{clip(n, 34)}</span>
          <span className="ahp-wbars-track"><span className="ahp-wbars-fill" style={{ width: `${(w[i] / max) * 100}%` }} /></span>
          <b className="ahp-wbars-val mono">{num(w[i], 4)} · {pct(w[i])}</b>
        </div>
      ))}
    </div>
  );
}

function SheetSteps({ sheet, no, mode, data }: { sheet: SheetBreakdown; no: number; mode: CalcMode; data: AhpBreakdownData }) {
  const { items, A, agg, per, expertA, iterations, Aw, ratios } = sheet;
  const n = items.length;
  const names = items.map((x) => x.name);
  const k = data.experts.length;
  const st = (i: number) => `${no}.${i}`;
  const upper = (i: number, j: number) => (j > i ? ('key' as const) : undefined);
  const used = agg.method;
  const other = used === 'eigenvector' ? agg.wMean : agg.wEigen;
  const pairs = pairsOf(n);

  // Ejemplo numérico de UNA celda de la media geométrica: el par donde más discrepan los expertos (o el primero).
  let ex: [number, number] = pairs[0] ?? [0, 1];
  if (k > 1) {
    let best = -1;
    for (const [i, j] of pairs) {
      const vals = expertA.map((M) => M[i][j]);
      const spread = Math.max(...vals) / Math.min(...vals);
      if (spread > best + 1e-9) { best = spread; ex = [i, j]; }
    }
  }
  const [ei, ej] = ex;

  const orderUsed = topByWeight(items, agg.w);
  const orderOther = topByWeight(items, other);
  const sameOrder = orderUsed.every((o, r) => o.i === orderOther[r].i);
  const iMaxDiff = agg.wEigen.reduce((b, x, i) => (Math.abs(x - agg.wMean[i]) > Math.abs(agg.wEigen[b] - agg.wMean[b]) ? i : b), 0);

  const ciRaw = (agg.lam - n) / (n - 1);
  const riN = riFor(n);
  const failing = per.map((p, e) => ({ p, e })).filter(({ p }) => !p.ok);

  if (n < 2) {
    return <p className="calc-reading">Esta hoja tiene un solo elemento: su peso es 1 y no hay nada que comparar.</p>;
  }

  return (
    <div className="calc-steps">
      {/* 1 · matriz agregada */}
      <CalcStep no={st(1)} mode={mode} defaultOpen={no === 1} title="La matriz de comparación pareada A"
        meaning={`Cada celda a_ij dice cuántas veces es más importante el elemento de la fila i que el de la columna j (a_ij ≈ w_i / w_j). La diagonal vale 1 (un elemento comparado consigo mismo) y la mitad de abajo son los recíprocos: si a_ij = 5, entonces a_ji = 1/5. Por eso solo se juzga la mitad de arriba: n(n−1)/2 juicios por experto.`}
        formula={'a_ii = 1        a_ji = 1 / a_ij        juicios por experto = n(n−1)/2'}>
        <CalcMatrix mode={mode} corner="A" caption={`Matriz agregada de ${k} experto${k === 1 ? '' : 's'} (negrita = mitad superior, la que se juzga)`}
          rows={names} cols={names} cells={A.map((r) => r.map((x) => fmt(x)))} hl={upper} wide />
        <Worked>{`n = ${n}  →  n(n−1)/2 = ${n}·${n - 1}/2 = ${sheet.totalPairs} juicios por experto\n${k} experto${k === 1 ? '' : 's'}  →  ${sheet.totalPairs * k} juicios en esta hoja`}</Worked>
        <Reading>{
          A[ei][ej] >= 1
            ? `fila «${names[ei]}», columna «${names[ej]}» = ${fmt(A[ei][ej])}: «${names[ei]}» es ${num(A[ei][ej], 2)} veces más importante que «${names[ej]}»; la celda simétrica (${fmt(A[ej][ei])}) es lo mismo visto al revés.`
            : `fila «${names[ei]}», columna «${names[ej]}» = ${fmt(A[ei][ej])}: «${names[ej]}» es ${num(1 / A[ei][ej], 2)} veces más importante que «${names[ei]}»; la celda simétrica (${fmt(A[ej][ei])}) es lo mismo visto al revés.`
        } Los valores exactos como 1/3 se escriben como fracción; los demás, con 3 decimales (son medias geométricas).</Reading>
      </CalcStep>

      {/* 2 · media geométrica */}
      <CalcStep no={st(2)} mode={mode} title={`Juntar a los expertos: media geométrica (${k} experto${k === 1 ? '' : 's'})`}
        meaning={k === 1
          ? 'Con un solo experto no hay nada que agregar: A es directamente su matriz. Con varios expertos, cada celda de A sería la media geométrica de sus juicios.'
          : 'Cada experto llena su propia matriz. Se combinan celda a celda con la media geométrica y no con la aritmética, porque la geométrica conserva la propiedad recíproca (a_ji = 1/a_ij); la aritmética la rompe (Forman & Peniwati, 1998).'}
        formula={'a_ij = ( a_ij¹ · a_ij² · … · a_ij^k )^(1/k)        k = número de expertos'}>
        {k > 0 && (
          <Worked title={`Ejemplo con una celda: «${clip(names[ei], 18)}» frente a «${clip(names[ej], 18)}»`}>
            {`a_${ei + 1}${ej + 1} = (${expertA.map((M) => g(M[ei][ej])).join(' · ')})^(1/${k}) = ${f3(A[ei][ej])}`}
          </Worked>
        )}
        {data.experts.map((e, x) => (
          <div key={e.id + x}>
            <CalcMatrix mode={mode} corner={`Experto ${x + 1}`} caption={`Matriz de ${e.label}${e.role ? ' · ' + e.role : ''}${sheet.answered[x] < sheet.totalPairs ? ` (respondió ${sheet.answered[x]} de ${sheet.totalPairs} juicios; los que faltan cuentan como 1)` : ''}`}
              rows={names} cols={names} cells={expertA[x].map((r) => r.map((v) => fmt(v)))} hl={upper} wide />
          </div>
        ))}
        {k > 1 && <Reading>Cada experto aporta su mirada (su rol aparece sobre su matriz); la media geométrica no elige a un experto: reparte por igual el peso de todos. Cuando dos expertos difieren mucho en una celda, la media queda en medio en escala multiplicativa (no aritmética).</Reading>}
      </CalcStep>

      {/* 3 · normalizar y promediar */}
      <CalcStep no={st(3)} mode={mode} title="Suma de columnas → matriz normalizada → promedio de cada fila"
        meaning="El procedimiento a mano: se suma cada columna, se divide cada celda entre la suma de su columna (así cada columna suma 1) y se promedia cada fila. Ese promedio es el peso del elemento (procedimiento del curso)."
        formula={'s_j = Σ_i a_ij        n_ij = a_ij / s_j        w_i = ( Σ_j n_ij ) / n'}>
        <Worked title="Con tus números: suma de columnas">
          {names.map((nm, j) => `Suma «${clip(nm, 18)}» = ${A.map((r) => f3(r[j])).join(' + ')} = ${f3(sum(A.map((r) => r[j])))}`).join('\n')}
        </Worked>
        <CalcMatrix mode={mode} corner="Normalizada" caption="Matriz normalizada (cada celda entre la suma de su columna) y promedio de la fila"
          rows={names} cols={[...names, 'Promedio de la fila = peso']} digits={4}
          cells={agg.N.map((r, i) => [...r, agg.wMean[i]])} hl={(_, j) => (j === n ? 'key' : undefined)}
          footer={[{ label: 'Suma de la columna', cells: [...Array(n).fill(1), sum(agg.wMean)] }]} wide />
        <Worked title="Con tus números: promedio de cada fila">
          {names.map((nm, i) => `«${clip(nm, 18)}» = (${agg.N[i].map((x) => f3(x)).join(' + ')}) / ${n} = ${num(agg.wMean[i], 4)}`).join('\n')}
        </Worked>
        <Reading>Cada columna suma exactamente 1 y los pesos también (última fila). Las sumas de los números redondeados a 3 decimales pueden diferir un poco en la cuarta cifra; el resultado usa los decimales completos.</Reading>
      </CalcStep>

      {/* 4 · vector de pesos: dos procedimientos, iteraciones */}
      <CalcStep no={st(4)} mode={mode} defaultOpen={no === 1} title="El vector de pesos: dos procedimientos y cuál se usa"
        meaning="Hay dos formas de pasar de la matriz a los pesos. El promedio de columnas es un atajo que se puede hacer a mano; el eigenvector principal (Saaty, 1980) es el método exacto y se obtiene repitiendo w ← A·w normalizado hasta que deja de cambiar (método de potencias). Coinciden si la matriz es perfectamente consistente."
        formula={'w⁽⁰⁾ = (1/n, …, 1/n)        w⁽ᵏ⁺¹⁾ = A·w⁽ᵏ⁾ / ‖A·w⁽ᵏ⁾‖₁        w = lím w⁽ᵏ⁾   (‖x‖₁ = suma de las entradas)'}>
        <div className="ahp-used" role="note">
          <b>Pesos usados en este análisis: {METHOD_TEXT[used]}.</b>{' '}
          {used === 'eigenvector'
            ? <>Es el método formal de Saaty y el que usan AHP-OS y los artículos. El atajo que se calcula a mano en clase (promedio de columnas, paso {st(3)}) da un resultado distinto salvo que la matriz sea perfectamente consistente: aquí la diferencia máxima es {(agg.diff * 100).toFixed(2)} puntos porcentuales (en «{clip(names[iMaxDiff], 30)}») y {sameOrder ? 'el orden de los elementos es el mismo con los dos.' : 'el orden de los elementos NO es el mismo con los dos: conviene revisar la consistencia.'}</>
            : <>Es el procedimiento a mano del curso. El eigenvector (método exacto de Saaty) se muestra al lado como verificación: difiere como máximo {(agg.diff * 100).toFixed(2)} puntos porcentuales (en «{clip(names[iMaxDiff], 30)}») y {sameOrder ? 'el orden es el mismo.' : 'el orden NO es el mismo: conviene revisar la consistencia.'}</>}
        </div>
        <CalcMatrix mode={mode} corner="Elemento" caption="Los dos procedimientos, lado a lado" rows={names}
          cols={['Promedio de columnas', 'Eigenvector (potencias)', 'Diferencia (puntos %)']}
          colHint={[used === 'mean' ? '✓ el que se usa' : 'atajo del curso', used === 'eigenvector' ? '✓ el que se usa' : 'método exacto', undefined]}
          cells={names.map((_, i) => [num(agg.wMean[i], 4), num(agg.wEigen[i], 4), ((agg.wEigen[i] - agg.wMean[i]) >= 0 ? '+' : '−') + Math.abs((agg.wEigen[i] - agg.wMean[i]) * 100).toFixed(2)])}
          hl={(_, j) => (j === (used === 'mean' ? 0 : 1) ? 'key' : undefined)}
          footer={[{ label: 'Suma', cells: [sum(agg.wMean), sum(agg.wEigen), ''] }]} />
        <CalcMatrix mode={mode} corner="Iteración" caption="Primeras iteraciones del método de potencias sobre A (cada fila suma 1)"
          rows={[...iterations.map((_, t) => (t === 0 ? 'w⁽⁰⁾ (pesos iguales)' : `w⁽${sup(t)}⁾`)), 'Límite (eigenvector)']} cols={names}
          cells={[...iterations, agg.wEigen]} hl={(i) => (i === iterations.length ? 'key' : undefined)} wide />
        {(() => {
          const w0 = iterations[0], q = A.map((r) => r.reduce((a, x, j) => a + x * w0[j], 0)), s = sum(q);
          return (
            <Worked title="Con tus números: de w⁽⁰⁾ a w⁽¹⁾ (primer elemento)">
              {`(A·w⁽⁰⁾)_1 = ${A[0].map((x) => `${f3(x)}·${f3(w0[0])}`).join(' + ')} = ${f3(q[0])}\n` +
                `Σ (A·w⁽⁰⁾) = ${q.map((x) => f3(x)).join(' + ')} = ${f3(s)}\n` +
                `w⁽¹⁾_1 = ${f3(q[0])} / ${f3(s)} = ${f3(iterations[1][0])}`}
            </Worked>
          );
        })()}
        <WeightBars names={names} w={agg.w} caption={`Pesos usados (${used === 'eigenvector' ? 'eigenvector' : 'promedio de columnas'})`} />
        <Reading title="Qué dice tu caso">
          {(() => {
            const t = orderUsed;
            const rest = t.slice(1, 3).map((o) => `«${clip(o.name, 26)}» (${pct(o.x)})`).join(' y ');
            return `${sheet.kind === 'criteria' ? 'El criterio más importante' : 'La mejor alternativa en este criterio'} es «${clip(t[0].name, 34)}» con ${pct(t[0].x)}${rest ? `, seguido de ${rest}` : ''}; el último es «${clip(t[t.length - 1].name, 34)}» con ${pct(t[t.length - 1].x)}. Los pesos suman 100 %.`;
          })()}
        </Reading>
      </CalcStep>

      {/* 5 · λmax */}
      <CalcStep no={st(5)} mode={mode} title="λmax: ¿cuánto «obedece» la matriz a sus propios pesos?"
        meaning="Se multiplica la matriz A por su propio vector de pesos w y se divide cada resultado entre el peso correspondiente. Si los juicios fueran perfectamente consistentes, todos esos cocientes valdrían n. λmax es el promedio de los cocientes."
        formula={'(A·w)_i = Σ_j a_ij · w_j        λmax = (1/n) · Σ_i (A·w)_i / w_i'}>
        <CalcMatrix mode={mode} corner="Elemento" caption="A·w y cocientes (A·w)_i / w_i" rows={names} cols={['w_i', '(A·w)_i', '(A·w)_i / w_i']}
          cells={names.map((_, i) => [agg.w[i], Aw[i], ratios[i]])} footer={[{ label: 'Promedio = λmax', cells: ['', '', num(agg.lam, 4)] }]} />
        <Worked>{`(A·w)_1 = ${A[0].map((x, j) => `${f3(x)}·${f3(agg.w[j])}`).join(' + ')} = ${num(Aw[0], 4)}\nλmax = (${ratios.map((x) => f3(x)).join(' + ')}) / ${n} = ${num(agg.lam, 4)}`}</Worked>
        <Reading>{used === 'eigenvector'
          ? `Con el eigenvector todos los cocientes son iguales entre sí y a λmax (por definición A·w = λ·w). `
          : 'Con el promedio de columnas los cocientes varían un poco entre elementos, y se promedian. '}
          {`Aquí λmax = ${num(agg.lam, 4)} frente a n = ${n}: ${agg.ok ? 'cerca de n, buena señal de consistencia' : 'lejos de n, señal de juicios contradictorios'} (λmax nunca es menor que n).`}</Reading>
      </CalcStep>

      {/* 6 · CI */}
      <CalcStep no={st(6)} mode={mode} title="CI: el índice de consistencia"
        meaning="Mide qué tan lejos está λmax de n, repartido entre los n−1 grados de libertad de la matriz. CI = 0 es consistencia perfecta; cuanto mayor, más se contradijeron los juicios."
        formula={'CI = (λmax − n) / (n − 1)'}>
        <Worked>{`CI = (${num(agg.lam, 4)} − ${n}) / (${n} − 1) = ${num(ciRaw, 4)}${ciRaw < 0 ? '  → por redondeo sale ligeramente negativo; se toma 0' : ''}\nCI usado = ${num(agg.ci, 4)}`}</Worked>
      </CalcStep>

      {/* 7 · RI */}
      <CalcStep no={st(7)} mode={mode} title="RI: el punto de referencia (índice aleatorio)"
        meaning="CI solo no dice si es «grande» o «pequeño»: hay que compararlo con el CI que tendría una matriz llena de juicios al azar del mismo tamaño. Ese promedio se llama RI y viene de una tabla publicada por Saaty (1980)."
        formula={'RI(n): tabla de Saaty; para n > 10 la plataforma usa 1.49'}>
        <CalcMatrix mode={mode} corner="" caption="Tabla de RI (Saaty, 1980); en negrita, el tamaño de tu matriz" rows={['RI']} cols={Array.from({ length: 10 }, (_, j) => `n = ${j + 1}`)}
          cells={[Array.from({ length: 10 }, (_, j) => num(RI[j + 1], 2))]} hl={(_, j) => (j + 1 === n ? 'key' : undefined)} />
        <Worked>{n > 10 ? `Tu matriz tiene n = ${n} (más de 10): se usa RI = 1.49 (el valor de n = 10).` : `Tu matriz tiene n = ${n}  →  RI = ${num(riN, 2)}${riN === 0 ? '  (con 1 o 2 elementos la matriz siempre es consistente: no hay con qué contradecirse)' : ''}`}</Worked>
      </CalcStep>

      {/* 8 · CR */}
      <CalcStep no={st(8)} mode={mode} defaultOpen={no === 1} title="CR: la razón de consistencia y la regla del 0.10"
        meaning="CR compara el CI de tus juicios con el RI del azar. Regla de bolsillo (Saaty): CR < 0.10 indica juicios consistentes y los pesos son confiables; CR ≥ 0.10 pide revisar los juicios."
        formula={'CR = CI / RI        aceptable si CR < 0.10'}>
        <Worked>{riN > 0
          ? `CR = ${num(agg.ci, 4)} / ${num(riN, 2)} = ${num(agg.cr, 4)}   →   ${agg.ok ? 'CR < 0.10  ✓ consistente' : 'CR ≥ 0.10  ✗ revisar los juicios'}`
          : `Con n = ${n}, RI = 0: CR no se define (dos elementos no pueden contradecirse). La plataforma toma CR = 0  ✓`}</Worked>
        <Reading title="Qué dice tu caso">
          {agg.ok
            ? `La matriz agregada de «${sheet.short}» es consistente (CR = ${num(agg.cr, 4)} < 0.10): los pesos se pueden usar.`
            : `La matriz agregada de «${sheet.short}» NO es consistente (CR = ${num(agg.cr, 4)} ≥ 0.10): los juicios se contradicen y los pesos no son confiables hasta revisarlos.`}
          {failing.length > 0 && ` Expertos con CR ≥ 0.10 en esta hoja: ${failing.map(({ p, e }) => `${data.experts[e]?.label ?? 'Experto'} (${num(p.cr, 3)})`).join(', ')}.`}
        </Reading>
      </CalcStep>
    </div>
  );
}

export default function AhpBreakdown({ mode, data, showProcess = true, current }: Props) {
  const { sheets, experts, synthesis: sy } = data;
  if (!sheets.length || experts.length === 0) {
    return (
      <CalcSection title="Cómo se calculó el AHP, paso a paso" accent="var(--m-ahp)" mode={mode}>
        <p className="calc-reading">Todavía no hay juicios de expertos incluidos en el cálculo: sin comparaciones por pares no hay matrices ni pesos que desglosar.</p>
      </CalcSection>
    );
  }
  const crit = sheets[0];
  const altSheets = sheets.slice(1);
  const fullAhp = altSheets.length > 0 && sy;
  const crCell = (a: { cr: number; ok: boolean }, n: number) => (n <= 2 ? 'n/a (n ≤ 2)' : `${a.cr.toFixed(3)} ${a.ok ? '✓' : '✗'}`);

  // Frases de consistencia por experto.
  const fails: string[] = [];
  sheets.forEach((s) => s.per.forEach((p, e) => { if (!p.ok) fails.push(`${experts[e]?.label ?? 'Experto'} en «${s.short}» (CR ${p.cr.toFixed(3)})`); }));
  const aggFails = sheets.filter((s) => !s.agg.ok).map((s) => s.short);

  return (
    <CalcSection title="Cómo se calculó el AHP, paso a paso" accent="var(--m-ahp)" mode={mode}
      intro={`Los mismos pasos del curso con los números de tu proyecto: ${experts.length} experto${experts.length === 1 ? '' : 's'}, ${crit.items.length} criterios${fullAhp ? ` y ${altSheets[0].items.length} alternativas (una matriz por criterio)` : ''}. ${fullAhp ? 'Los pasos «A» y «B» son de contexto' : 'El paso «B» es de contexto: los pesos de los criterios salen de esta comparación por pares, y las alternativas se evalúan con la matriz de decisión del método elegido'}; cada hoja repite los 8 pasos de la matriz al peso y su consistencia${fullAhp ? '; al final, la síntesis' : ''}.`}>
      {/* El proceso de 6 pasos y su glosario hablan de comparar alternativas por pares: solo aplican cuando AHP es el método de ranking. */}
      {showProcess && fullAhp && (
        <CalcStep no="A" mode={mode} title="El proceso en 6 pasos y el vocabulario"
          meaning="AHP descompone la decisión en un árbol y compara de a pares en cada nivel. El vocabulario de local, global y final se usa en todos los pasos que siguen.">
          <AhpProcessSteps mode={mode} current={current} showWhere showGlossary title="Los 6 pasos" />
        </CalcStep>
      )}

      <CalcStep no="B" mode={mode} title="La escala de Saaty y cómo se guarda cada juicio"
        meaning="Cada comparación de a pares se responde con un número de la escala 1 a 9 (nunca un número libre). Los valores pares (2, 4, 6, 8) son intermedios. En la plataforma cada juicio se guarda como un entero v entre −8 y +8: 0 = igual; negativo = gana el primer elemento; positivo = gana el segundo."
        formula={'intensidad = |v| + 1      v < 0 → a_ij = intensidad      v > 0 → a_ij = 1 / intensidad      v = 0 → a_ij = 1'}>
        <CalcMatrix mode={mode} corner="Intensidad" caption="Escala fundamental de Saaty" rows={Array.from({ length: 9 }, (_, i) => String(i + 1))}
          cols={['Significado (el ganador es…)', 'v si gana el 1.º / el 2.º', 'a_ij si gana el 1.º / el 2.º']}
          cells={Array.from({ length: 9 }, (_, i) => {
            const k = i + 1;
            const text = k === 1 ? 'igual de importante: ambos contribuyen igual al objetivo'
              : k === 3 ? 'moderadamente más importante: la experiencia y el juicio favorecen levemente a uno'
              : k === 5 ? 'fuertemente más importante: la experiencia y el juicio favorecen fuertemente a uno'
              : k === 7 ? 'muy fuertemente más importante: dominancia demostrada en la práctica'
              : k === 9 ? 'extremadamente más importante: la evidencia favorece a uno con el máximo grado de certeza'
              : `valor intermedio (${SAATY[k]})`;
            return [text, k === 1 ? '0' : `−${k - 1} / +${k - 1}`, k === 1 ? '1 / 1' : `${k} / 1/${k}`];
          })} wide />
        <Reading>Un juicio v = −2 dice «el primero es moderadamente (3 veces) más importante que el segundo»: a_ij = 3 y su recíproco a_ji = 1/3. Un par sin responder cuenta como 1 (igual importancia).</Reading>
      </CalcStep>

      {sheets.map((s, si) => {
        const head = `Hoja ${si + 1} · ${s.label}`;
        const meta = s.items.length < 2 ? 'un solo elemento' : `n = ${s.items.length} · CR ${crCell(s.agg, s.items.length)}`;
        return mode === 'report' ? (
          <div className="ahp-sheet" key={s.key}>
            <h4 className="ahp-sheet-h">{head} <span className="ahp-sheet-meta">{meta}</span></h4>
            <SheetSteps sheet={s} no={si + 1} mode={mode} data={data} />
          </div>
        ) : (
          <details className="ahp-sheet" key={s.key} open={si === 0}>
            <summary className="ahp-sheet-h">{head} <span className="ahp-sheet-meta">{meta}</span></summary>
            <SheetSteps sheet={s} no={si + 1} mode={mode} data={data} />
          </details>
        );
      })}

      <CalcStep no="S.1" mode={mode} defaultOpen title="Consistencia de cada experto en cada hoja"
        meaning="El CR se calcula también para la matriz de cada experto por separado, no solo para la del grupo. Un experto con CR ≥ 0.10 en una hoja tiene juicios que se contradicen entre sí en esa hoja; el grupo se agrega igual (media geométrica), pero conviene revisarlo con él."
        formula={'CR = CI / RI  (una vez por experto y por hoja)        ✓ = CR < 0.10        ✗ = CR ≥ 0.10'}>
        <CalcMatrix mode={mode} corner="Experto" caption="CR por experto y por hoja" rows={experts.map((e) => e.label)}
          cols={sheets.map((s) => s.short)}
          cells={experts.map((_, e) => sheets.map((s) => (s.per[e] ? crCell(s.per[e], s.items.length) : '—')))}
          hl={(e, j) => (sheets[j].items.length > 2 && sheets[j].per[e] && !sheets[j].per[e].ok ? 'bad' : undefined)}
          footer={[{ label: 'Grupo (matriz agregada)', cells: sheets.map((s) => crCell(s.agg, s.items.length)) }]} wide />
        <CalcMatrix mode={mode} corner="Experto" caption="Juicios respondidos por experto (de los n(n−1)/2 posibles de cada hoja)" rows={experts.map((e) => e.label)} cols={sheets.map((s) => s.short)}
          cells={experts.map((_, e) => sheets.map((s) => `${s.answered[e] ?? 0} / ${s.totalPairs}`))} wide />
        <Reading title="Qué dice tu caso">
          {fails.length === 0
            ? 'Todos los expertos son consistentes en todas las hojas (CR < 0.10).'
            : `Hay ${fails.length} caso${fails.length === 1 ? '' : 's'} con CR ≥ 0.10: ${fails.slice(0, 6).join('; ')}${fails.length > 6 ? `; y ${fails.length - 6} más (ver la tabla)` : ''}.`}
          {aggFails.length > 0 ? ` Además, la matriz agregada no es consistente en: ${aggFails.join(', ')}.` : ' Todas las matrices agregadas del grupo son consistentes.'}
        </Reading>
      </CalcStep>

      {fullAhp && sy && (() => {
        const { synth, ideal } = sy;
        const crits = crit.items.map((c) => c.name);
        const alts = altSheets[0].items.map((a) => a.name);
        const first = synth.order[0], second = synth.order[1];
        const topContrib = first != null ? synth.rows[first].contrib.reduce((b, x, c, arr) => (x > arr[b] ? c : b), 0) : 0;
        const rowsP = synth.rows.map((r) => r.g);
        const idealRankChange = ideal.rank.some((r, i) => r !== synth.rows[i].rank);
        return (
          <>
            <CalcStep no="S.2" mode={mode} defaultOpen title="Síntesis: combinar pesos y prioridades locales en el ranking"
              meaning="Para cada alternativa se multiplica su prioridad local en cada criterio (L_ij, de las hojas de alternativas) por el peso de ese criterio (w_j, de la hoja de criterios) y se suma. El resultado es la prioridad global P_i; ordenadas de mayor a menor son la prioridad final."
              formula={'P_i = Σ_j  w_j · L_ij        (en forma de matrices:  P = L × w)'}>
              <div className="ahp-mv" role="group" aria-label="Matriz de prioridades locales por el vector de pesos es igual al vector de prioridades globales">
                <CalcMatrix mode={mode} corner="L" caption="L: prioridad local (cada columna suma 1)" rows={alts} cols={crits}
                  colHint={synth.wr.map((w) => 'w = ' + num(w, 3))} cells={synth.rows.map((r) => r.loc)} digits={4} />
                <span className="ahp-op" aria-hidden="true">×</span>
                <CalcMatrix mode={mode} corner="w" caption="w: pesos de los criterios" rows={crits} cols={['w']} cells={synth.wr.map((w) => [w])} digits={4} />
                <span className="ahp-op" aria-hidden="true">=</span>
                <CalcMatrix mode={mode} corner="P" caption="P: prioridad global" rows={alts} cols={['P']} cells={rowsP.map((g) => [g])} digits={4}
                  hl={(i) => (synth.rows[i].rank === 1 && !synth.tie ? 'good' : undefined)} />
              </div>
              <Worked title="Con tus números">
                {synth.order.map((i) => {
                  const r = synth.rows[i];
                  return `P(${clip(r.name, 22)}) = ${synth.wr.map((w, c) => `${f3(w)}·${f3(r.loc[c] ?? 0)}`).join(' + ')} = ${num(r.g, 4)}   (#${r.rank})`;
                }).join('\n') + `\nΣ P = ${num(sum(rowsP), 4)}  (las prioridades globales suman 1)`}
              </Worked>
              <Reading title="Qué dice tu caso">
                {synth.tie
                  ? 'Las alternativas quedan empatadas: con estos juicios el AHP no distingue entre ellas.'
                  : `Gana «${synth.rows[first].name}» con P = ${num(synth.rows[first].g, 4)} (${pct(synth.rows[first].g)})${second != null ? `, por ${((synth.rows[first].g - synth.rows[second].g) * 100).toFixed(1)} puntos sobre «${synth.rows[second].name}» (${num(synth.rows[second].g, 4)})` : ''}. Lo que más aporta a la ganadora es «${crits[topContrib]}»: ${num(synth.rows[first].contrib[topContrib], 4)} de sus ${num(synth.rows[first].g, 4)} (peso ${pct(synth.wr[topContrib])} × prioridad local ${num(synth.rows[first].loc[topContrib] ?? 0, 4)}).`}
              </Reading>
            </CalcStep>

            <CalcStep no="S.3" mode={mode} title="Sensibilidad de la síntesis: modo distributivo frente a modo ideal"
              meaning="Todo lo anterior es el modo DISTRIBUTIVO: en cada criterio las prioridades locales suman 1, por lo que depende de cuántas alternativas compitan. En el modo IDEAL cada prioridad local se divide entre la MEJOR de su criterio (que vale 1). Con un conjunto cerrado de alternativas suelen coincidir; el modo ideal importa si se agregan o quitan alternativas parecidas a la líder (Saaty & Vargas, 1993)."
              formula={"L'_ij = L_ij / max_i L_ij        P'_i = Σ_j w_j · L'_ij        P'_i normalizada = P'_i / Σ P'"}>
              <CalcMatrix mode={mode} corner="L′" caption="Prioridades locales en modo ideal (la mejor alternativa de cada criterio vale 1)" rows={alts} cols={crits}
                colHint={ideal.best.map((b) => 'mejor: ' + num(b, 3))} cells={ideal.localIdeal} digits={4}
                hl={(i, c) => (ideal.localIdeal[i][c] >= 1 - 1e-12 ? 'key' : undefined)} wide />
              <CalcMatrix mode={mode} corner="Alternativa" caption="Distributivo frente a ideal" rows={synth.order.map((i) => alts[i])}
                cols={['Distributivo P', 'Posición', 'Ideal P′ (sin normalizar)', 'Ideal normalizado', 'Posición ideal', '¿Cambia?']}
                cells={synth.order.map((i) => [num(synth.rows[i].g, 4), '#' + synth.rows[i].rank, num(ideal.raw[i], 4), num(ideal.norm[i], 4), '#' + ideal.rank[i], synth.rows[i].rank === ideal.rank[i] ? '= igual' : '⚠ cambia'])}
                hl={(k, j) => (j === 5 && synth.rows[synth.order[k]].rank !== ideal.rank[synth.order[k]] ? 'bad' : undefined)} wide />
              <Worked title="Con tus números (primera alternativa del ranking)">
                {`P'(${clip(alts[first], 22)}) = ${synth.wr.map((w, c) => `${f3(w)}·${f3(ideal.localIdeal[first][c])}`).join(' + ')} = ${num(ideal.raw[first], 4)}\nnormalizado = ${num(ideal.raw[first], 4)} / ${num(sum(ideal.raw), 4)} = ${num(ideal.norm[first], 4)}`}
              </Worked>
              <Reading title="Qué dice tu caso">
                {idealRankChange
                  ? (ideal.rank[first] === 1
                    ? `⚠ La primera posición («${alts[first]}») se mantiene en los dos modos, pero cambian posiciones intermedias: esas alternativas están tan cerca entre sí que la normalización las reordena. `
                    : `⚠ La primera posición cambia entre los dos modos: con el modo ideal gana «${alts[ideal.rank.indexOf(1)]}» en vez de «${alts[first]}». `)
                    + 'El ranking depende de cómo se normalizan las prioridades locales; antes de decidir conviene revisar si hay alternativas casi iguales entre sí y qué modo corresponde a tu problema.'
                  : 'El orden es el mismo en los dos modos, así que el ranking no depende de la normalización elegida. Esto NO garantiza que no aparezca una inversión de posiciones (rank reversal) si más adelante se agregan alternativas parecidas a la líder: en ese caso el modo distributivo puede invertir el orden y el ideal no.'}
              </Reading>
            </CalcStep>
          </>
        );
      })()}
    </CalcSection>
  );
}

