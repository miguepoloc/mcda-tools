import type { ReactNode } from 'react';
import type { Alternative, Criterion, DecisionMatrix } from '@/lib/types';
import { criticSteps, entropySteps } from '@/lib/weights';
import { CalcMatrix, CalcSection, CalcStep, Reading, Worked, num, type CalcMode } from './CalcKit';

/** Desglose de los pesos OBJETIVOS (Sesión 1, diapositiva 5): CRITIC y Entropía con todos sus intermedios y la sustitución numérica.
 * Los números salen de `criticSteps` / `entropySteps` (weights.ts), las mismas funciones que dan `criticWeights` / `entropyWeights`.
 * `dm` debe ser la MISMA matriz numérica con la que se calcularon los pesos (Results: `dmNum`, es decir, con los criterios «objetivo»
 * ya convertidos en costo y, en Fuzzy TOPSIS, desdifusificada). PCA (diapositiva 5) no está implementado en la plataforma. */
/** Acento más oscuro que --pa (el número blanco del paso necesita ≥ 4.5:1 también en modo oscuro). */
const ACCENT = 'color-mix(in srgb, var(--pa) 78%, black)';

export default function WeightsBreakdown({ method, criteria, alternatives, dm, mode }: {
  method: 'critic' | 'entropy';
  criteria: Criterion[];
  alternatives: Alternative[];
  dm: DecisionMatrix;
  mode: CalcMode;
}) {
  const title = method === 'critic' ? 'Pesos por CRITIC, paso a paso' : 'Pesos por Entropía de Shannon, paso a paso';
  const intro = method === 'critic'
    ? 'CRITIC (Diakoulaki et al., 1995) pesa más el criterio que combina alta variación entre alternativas con baja correlación frente a los demás: el que más información distinta aporta. No intervienen expertos.'
    : 'La Entropía (Shannon, 1948) pesa más el criterio donde las alternativas se distinguen más entre sí: menos entropía = más contraste = más información = más peso. No intervienen expertos.';
  const foot = <p className="pbk-rule"><b>Nota sobre PCA.</b> La diapositiva 5 también menciona PCA (pesos según la varianza que explica cada criterio); la plataforma no lo implementa, solo CRITIC y Entropía.</p>;

  if (criteria.length === 0 || alternatives.length < 2) {
    return (
      <CalcSection title={title} intro={intro} mode={mode} accent={ACCENT}>
        <p className="muted">Necesitas al menos 2 alternativas y 1 criterio con datos en la «Matriz de decisión» para ver el cálculo.</p>
        {foot}
      </CalcSection>
    );
  }
  return method === 'critic'
    ? <Critic title={title} intro={intro} foot={foot} criteria={criteria} alternatives={alternatives} dm={dm} mode={mode} />
    : <Entropy title={title} intro={intro} foot={foot} criteria={criteria} alternatives={alternatives} dm={dm} mode={mode} />;
}

type P = { title: string; intro: string; foot: ReactNode; criteria: Criterion[]; alternatives: Alternative[]; dm: DecisionMatrix; mode: CalcMode };

const nmC = (c: Criterion) => c.name.trim() || '(sin nombre)';
/** «a + b + c + …» con a lo más 6 términos (matrices grandes no caben en una línea). */
const terms = (xs: number[], f: (x: number) => string, max = 6) =>
  xs.slice(0, max).map(f).join(' + ') + (xs.length > max ? ` + … (${xs.length} términos)` : '');
/** Número con paréntesis si es negativo, para que «1 − (−0.587)» no se lea «1 − -0.587». */
const sg = (x: number, d = 4) => (x < 0 ? `(${num(x, d)})` : num(x, d));
const kindHint = (t: 'max' | 'min') => (t === 'min' ? 'costo ↓' : 'beneficio ↑');

function Critic({ title, intro, foot, criteria, alternatives, dm, mode }: P) {
  const S = criticSteps(criteria, alternatives, dm);
  const cn = criteria.map(nmC), an = alternatives.map((a) => a.name.trim() || '(sin nombre)');
  const hints = S.types.map(kindHint);
  const j0 = 0, i0 = 0, k0 = criteria.length > 1 ? 1 : 0;
  const varies = S.hi[j0] !== S.lo[j0];
  const order = S.w.map((w, j) => ({ w, j })).sort((a, b) => b.w - a.w);
  const top = order[0], bottom = order[order.length - 1];
  const avgSigma = S.sigma.reduce((a, b) => a + b, 0) / S.m, avgConf = S.conflict.reduce((a, b) => a + b, 0) / S.m;
  const flat = S.sigma.filter((s) => s === 0).length;
  const why = (j: number) => `σ = ${num(S.sigma[j], 3)} (${S.sigma[j] >= avgSigma ? 'por encima' : 'por debajo'} del promedio ${num(avgSigma, 3)}) y Σ(1 − ρ) = ${num(S.conflict[j], 3)} (${S.conflict[j] >= avgConf ? 'por encima' : 'por debajo'} del promedio ${num(avgConf, 3)})`;

  return (
    <CalcSection title={title} intro={intro} mode={mode} accent={ACCENT} id="desglose-pesos"
      summary={`Criterio con más peso: ${cn[top.j]} (${(top.w * 100).toFixed(1)} %) · el de menos: ${cn[bottom.j]} (${(bottom.w * 100).toFixed(1)} %)`}>
      <CalcStep no={1} title="Matriz de decisión de partida" mode={mode} defaultOpen
        meaning="Los valores tal cual están en la «Matriz de decisión». CRITIC solo mira cómo varían y se relacionan las columnas, no quién es «bueno» o «malo»: por eso el tipo (beneficio/costo) solo importa para orientar la normalización."
        formula="x_ij = valor de la alternativa i en el criterio j">
        <CalcMatrix mode={mode} corner="Alternativa" caption="Matriz de decisión (valores originales)" rows={an} cols={cn} colHint={hints} cells={S.raw} digits={3} wide />
      </CalcStep>

      <CalcStep no={2} title="Normalizar (min-max) para poner todo en [0, 1]" mode={mode}
        meaning="Los criterios vienen en unidades distintas (metros, dólares, años): no se pueden comparar variaciones sin llevarlos a la misma escala. En beneficio 1 es el mejor valor observado; en costo se invierte (1 = el menor)."
        formula={'Beneficio: r_ij = (x_ij − mín_j) / (máx_j − mín_j)\nCosto:     r_ij = (máx_j − x_ij) / (máx_j − mín_j)\nSi el criterio no varía (máx = mín): r_ij = 0'}>
        <CalcMatrix mode={mode} corner="Alternativa" caption="Matriz normalizada r_ij" rows={an} cols={cn} colHint={hints} cells={S.norm} digits={4} wide />
        <Worked>
          {varies
            ? `${cn[j0]} · ${an[i0]} (${S.types[j0] === 'min' ? 'costo' : 'beneficio'}): mín = ${num(S.lo[j0], 3)}, máx = ${num(S.hi[j0], 3)}\nr = ${S.types[j0] === 'min'
              ? `(${num(S.hi[j0], 3)} − ${num(S.raw[i0][j0], 3)}) / (${num(S.hi[j0], 3)} − ${num(S.lo[j0], 3)})`
              : `(${num(S.raw[i0][j0], 3)} − ${num(S.lo[j0], 3)}) / (${num(S.hi[j0], 3)} − ${num(S.lo[j0], 3)})`} = ${num(S.norm[i0][j0], 4)}`
            : `${cn[j0]} vale lo mismo en todas las alternativas (${num(S.lo[j0], 3)}): no varía, así que r = 0 en toda la columna.`}
        </Worked>
        <Reading>cada columna ahora va de 0 (peor observado) a 1 (mejor observado). Una columna de puros ceros es un criterio que no distingue entre alternativas.</Reading>
      </CalcStep>

      <CalcStep no={3} title="Contraste de cada criterio: desviación estándar σ_j" mode={mode}
        meaning="Mide cuánto se separan las alternativas en ese criterio. σ alta = el criterio las distingue; σ = 0 = todas valen lo mismo y no aporta nada."
        formula={'r̄_j = (Σ_i r_ij) / n\nσ_j = √( Σ_i (r_ij − r̄_j)² / n )        (desviación estándar de población, n = alternativas)'}>
        <CalcMatrix mode={mode} corner="Criterio" caption="Contraste de cada criterio" rows={cn} cols={['Media r̄_j', 'σ_j']} cells={cn.map((_, j) => [S.mean[j], S.sigma[j]])} digits={4} />
        <Worked>
          {`${cn[j0]}:  r̄ = (${terms(S.norm.map((r) => r[j0]), (x) => num(x, 4))}) / ${S.n} = ${num(S.mean[j0], 4)}\nσ = √( (${terms(S.norm.map((r) => r[j0]), (x) => `(${num(x, 4)} − ${num(S.mean[j0], 4)})²`, 4)}) / ${S.n} ) = ${num(S.sigma[j0], 4)}`}
        </Worked>
        <Reading>la σ más alta ({cn[S.sigma.indexOf(Math.max(...S.sigma))]}, {num(Math.max(...S.sigma), 4)}) es el criterio que más separa a las alternativas; una σ baja anticipa un peso bajo.</Reading>
      </CalcStep>

      <CalcStep no={4} title="Relación entre criterios: matriz de correlación ρ" mode={mode}
        meaning="Si dos criterios suben y bajan juntos (ρ cerca de 1) dicen casi lo mismo, así que el segundo aporta poca información nueva. ρ cerca de 0 o negativa = información distinta o contrapuesta."
        formula={'ρ_jk = Σ_i (r_ij − r̄_j)(r_ik − r̄_k) / √( Σ_i (r_ij − r̄_j)² · Σ_i (r_ik − r̄_k)² )\nDiagonal = 1 · si una columna no varía, ρ = 0'}>
        <CalcMatrix mode={mode} corner="ρ" caption="Correlación de Pearson entre criterios" rows={cn} cols={cn} cells={S.corr} digits={3} wide
          hl={(i, j) => (i !== j && Math.abs(S.corr[i][j]) >= 0.8 ? 'key' : undefined)}
          footer={[{ label: 'Σ_k (1 − ρ_jk)', hint: 'información distinta', cells: S.conflict }]} />
        <Worked>
          {`${cn[j0]} frente a ${cn[k0]}: ρ = ${num(S.corr[j0][k0], 4)} (calculado con las columnas de la matriz normalizada)\nΣ_k (1 − ρ_${j0 + 1}k) = ${terms(S.corr[j0], (r) => `(1 − ${sg(r, 3)})`)} = ${num(S.conflict[j0], 4)}`}
        </Worked>
        <Reading>las celdas marcadas (|ρ| ≥ 0.8) son pares de criterios casi redundantes. La fila «Σ(1 − ρ)» suma cuánta información distinta aporta cada criterio: más alto = más independiente de los demás.</Reading>
      </CalcStep>

      <CalcStep no={5} title="Información total de cada criterio: C_j" mode={mode}
        meaning="Combina los dos ingredientes: contraste (σ) e independencia (Σ(1 − ρ)). Un criterio pesa mucho solo si separa a las alternativas Y no repite lo que dicen los demás."
        formula="C_j = σ_j × Σ_k (1 − ρ_jk)">
        <CalcMatrix mode={mode} corner="Criterio" caption="Cantidad de información C_j" rows={cn} cols={['σ_j', 'Σ(1 − ρ)', 'C_j']} cells={cn.map((_, j) => [S.sigma[j], S.conflict[j], S.C[j]])} digits={4}
          footer={[{ label: 'Suma', cells: ['', '', num(S.total, 4)] }]} />
        <Worked>{`${cn[j0]}: C = ${num(S.sigma[j0], 4)} × ${num(S.conflict[j0], 4)} = ${num(S.C[j0], 4)}\nΣC = ${terms(S.C, (c) => num(c, 4))} = ${num(S.total, 4)}`}</Worked>
      </CalcStep>

      <CalcStep no={6} title="Pesos finales: w_j = C_j / ΣC" mode={mode} defaultOpen
        meaning="Se reparte el 100% en proporción a la información de cada criterio. Estos son los pesos que entran al método de ranking."
        formula="w_j = C_j / Σ_k C_k        (Σ w_j = 1)">
        <CalcMatrix mode={mode} corner="Criterio" caption="Pesos CRITIC" rows={cn} cols={['C_j', 'Peso w_j', 'Peso %']} cells={cn.map((_, j) => [S.C[j], S.w[j], `${(S.w[j] * 100).toFixed(1)} %`])} digits={4}
          hl={(i, j) => (i === top.j && j === 1 ? 'key' : undefined)}
          footer={[{ label: 'Suma', cells: [num(S.total, 4), num(S.w.reduce((a, b) => a + b, 0), 4), '100 %'] }]} />
        <Worked>{`${cn[j0]}: w = ${num(S.C[j0], 4)} / ${num(S.total, 4)} = ${num(S.w[j0], 4)}`}</Worked>
        <Reading title="Qué dice tu caso">
          {flat === S.m
            ? 'Ningún criterio varía entre alternativas (σ = 0 en todos): CRITIC no puede repartir pesos con estos datos.'
            : `CRITIC dio más peso a ${cn[top.j]} (${(top.w * 100).toFixed(1)} %): ${why(top.j)}. El que menos pesa es ${cn[bottom.j]} (${(bottom.w * 100).toFixed(1)} %): ${why(bottom.j)}.${flat ? ` ${flat} criterio${flat === 1 ? '' : 's'} sin variación recibe${flat === 1 ? '' : 'n'} peso 0.` : ''}`}
        </Reading>
        <p className="pbk-rule"><b>Ojo.</b> Estos pesos miden contraste de los datos, no importancia para quien decide: un criterio muy relevante pero casi igual en todas las alternativas recibe peso bajo.</p>
      </CalcStep>
      {foot}
    </CalcSection>
  );
}

function Entropy({ title, intro, foot, criteria, alternatives, dm, mode }: P) {
  const S = entropySteps(criteria, alternatives, dm);
  const cn = criteria.map(nmC), an = alternatives.map((a) => a.name.trim() || '(sin nombre)');
  const hints = S.types.map(kindHint);
  const j0 = 0, i0 = 0;
  const anyCost = S.types.includes('min');
  const order = S.w.map((w, j) => ({ w, j })).sort((a, b) => b.w - a.w);
  const top = order[0], bottom = order[order.length - 1];
  const colP = (j: number) => S.p.map((r) => r[j]);
  const negative = S.raw.some((r) => r.some((x) => x < 0));

  return (
    <CalcSection title={title} intro={intro} mode={mode} accent={ACCENT} id="desglose-pesos"
      summary={`Criterio con más peso: ${cn[top.j]} (${(top.w * 100).toFixed(1)} %) · el de menos: ${cn[bottom.j]} (${(bottom.w * 100).toFixed(1)} %)`}>
      <CalcStep no={1} title="Matriz de decisión de partida" mode={mode} defaultOpen
        meaning="Los valores tal cual están en la «Matriz de decisión». La entropía necesita valores positivos: reparte cada columna como si fuera un 100 % entre las alternativas."
        formula="x_ij = valor de la alternativa i en el criterio j">
        <CalcMatrix mode={mode} corner="Alternativa" caption="Matriz de decisión (valores originales)" rows={an} cols={cn} colHint={hints} cells={S.raw} digits={3} wide />
        {negative && <p className="pbk-warn-box" role="note"><b>Hay valores negativos.</b> La entropía no los admite: los pesos resultantes no son fiables. Revisa la matriz.</p>}
      </CalcStep>

      <CalcStep no={2} title="Orientar los criterios de costo" mode={mode}
        meaning={anyCost ? 'En un criterio de costo lo pequeño es mejor. Para que «mucho contraste» signifique lo mismo en todos, los costos se invierten (1/x) antes de repartir.' : 'Ningún criterio es de costo, así que los valores quedan igual.'}
        formula={'Beneficio: x′_ij = x_ij\nCosto:     x′_ij = 1 / x_ij        (0 si x_ij = 0)'}>
        <CalcMatrix mode={mode} corner="Alternativa" caption="Valores orientados x′_ij" rows={an} cols={cn} colHint={hints} cells={S.oriented} digits={4} wide />
        {anyCost && <Worked>{(() => { const jc = S.types.indexOf('min'); return `${cn[jc]} · ${an[i0]} (costo): x′ = 1 / ${num(S.raw[i0][jc], 3)} = ${num(S.oriented[i0][jc], 4)}`; })()}</Worked>}
      </CalcStep>

      <CalcStep no={3} title="Proporciones: cada columna como un reparto del 100 %" mode={mode}
        meaning="p_ij es la parte del total del criterio que se lleva cada alternativa. Si las partes son parejas (todas ≈ 1/n) el criterio no distingue; si una alternativa se lleva casi todo, sí."
        formula="p_ij = x′_ij / Σ_i x′_ij">
        <CalcMatrix mode={mode} corner="Alternativa" caption="Proporciones p_ij (cada columna suma 1)" rows={an} cols={cn} cells={S.p} digits={4} wide
          footer={[{ label: 'Σ_i x′_ij', hint: 'denominador', cells: S.colTotal }, { label: 'Σ_i p_ij', cells: cn.map((_, j) => colP(j).reduce((a, b) => a + b, 0)) }]} />
        <Worked>{`${cn[j0]} · ${an[i0]}: p = ${num(S.oriented[i0][j0], 4)} / ${num(S.colTotal[j0], 4)} = ${num(S.p[i0][j0], 4)}`}</Worked>
      </CalcStep>

      <CalcStep no={4} title="Entropía de cada criterio: E_j" mode={mode}
        meaning={`Mide qué tan parejo es el reparto: E cerca de 1 = todas las alternativas casi iguales (no informa); E cerca de 0 = una domina (informa mucho). k = 1/ln(n) = 1/ln(${S.n}) = ${num(S.k, 4)} la acota entre 0 y 1.`}
        formula={'E_j = −k · Σ_i p_ij · ln(p_ij)        con k = 1 / ln(n)\n(un término con p = 0 vale 0)'}>
        <CalcMatrix mode={mode} corner="Alternativa" caption="Términos p_ij · ln(p_ij)" rows={an} cols={cn} cells={S.plnp} digits={4} wide
          footer={[{ label: 'Σ_i p·ln(p)', cells: cn.map((_, j) => S.plnp.reduce((a, r) => a + r[j], 0)) }, { label: 'E_j = −k · Σ', hint: `k = ${num(S.k, 4)}`, cells: S.E }]} />
        <Worked>{`${cn[j0]}: E = −${num(S.k, 4)} × (${terms(S.plnp.map((r) => r[j0]), (x) => sg(x, 4))})\n     = −${num(S.k, 4)} × ${sg(S.plnp.reduce((a, r) => a + r[j0], 0), 4)} = ${num(S.E[j0], 4)}`}</Worked>
        <Reading>compara la fila E_j: la más cercana a 1 es el criterio que menos distingue entre alternativas, la más baja el que más.</Reading>
      </CalcStep>

      <CalcStep no={5} title="Divergencia y pesos finales" mode={mode} defaultOpen
        meaning="La «divergencia» d_j = 1 − E_j es cuánta información aporta el criterio. Los pesos reparten el 100 % en proporción a esa divergencia."
        formula={'d_j = 1 − E_j\nw_j = d_j / Σ_k d_k        (Σ w_j = 1)'}>
        <CalcMatrix mode={mode} corner="Criterio" caption="Pesos de Entropía" rows={cn} cols={['E_j', 'd_j = 1 − E_j', 'Peso w_j', 'Peso %']} cells={cn.map((_, j) => [S.E[j], S.d[j], S.w[j], `${(S.w[j] * 100).toFixed(1)} %`])} digits={4}
          hl={(i, j) => (i === top.j && j === 2 ? 'key' : undefined)}
          footer={[{ label: 'Suma', cells: ['', num(S.dTotal, 4), num(S.w.reduce((a, b) => a + b, 0), 4), '100 %'] }]} />
        <Worked>{`${cn[j0]}: d = 1 − ${num(S.E[j0], 4)} = ${num(S.d[j0], 4)}\nΣd = ${terms(S.d, (d) => num(d, 4))} = ${num(S.dTotal, 4)}\nw = ${num(S.d[j0], 4)} / ${num(S.dTotal, 4)} = ${num(S.w[j0], 4)}`}</Worked>
        <Reading title="Qué dice tu caso">
          {S.d.every((d) => !(d > 1e-12))
            ? 'Ningún criterio distingue entre alternativas (E ≈ 1 en todos): la Entropía no puede repartir pesos con estos datos.'
            : `La Entropía dio más peso a ${cn[top.j]} (${(top.w * 100).toFixed(1)} %): su entropía es ${num(S.E[top.j], 3)}, o sea, sus valores se reparten de forma desigual entre las alternativas y por eso las distingue. El que menos pesa es ${cn[bottom.j]} (${(bottom.w * 100).toFixed(1)} %), con E = ${num(S.E[bottom.j], 3)}: sus valores son más parejos.`}
        </Reading>
        <p className="pbk-rule"><b>Ojo.</b> Estos pesos miden dispersión de los datos, no importancia para quien decide: un criterio crucial pero parecido en todas las alternativas recibe poco peso.</p>
      </CalcStep>
      {foot}
    </CalcSection>
  );
}
