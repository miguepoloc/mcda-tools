import type { CalcMode } from './CalcKit';

/** Los 6 pasos de AHP (diapositivas 6, 8 y 30 de la Sesión 2) con un marcador «estás aquí», y el glosario mínimo (relación de preferencia,
 * prioridad local, global y final). Es una pieza pura: no calcula nada. `where` = en qué pasos del desglose (AhpBreakdown) se ve cada uno. */

export const AHP_STEPS: { no: number; title: string; text: string; where: string }[] = [
  { no: 1, title: 'Estructurar la jerarquía', text: 'Objetivo → criterios → alternativas.', where: 'Árbol jerárquico' },
  { no: 2, title: 'Comparar los criterios de a pares', text: 'Una matriz n×n con la escala de Saaty: un juicio por cada par de criterios y por cada experto.', where: 'Hoja 1, pasos 1.1 y 1.2' },
  { no: 3, title: 'Calcular el vector de prioridad', text: 'De la matriz a los pesos: normalizar y promediar, o el eigenvector principal de Saaty.', where: 'Hoja 1, pasos 1.3 y 1.4' },
  { no: 4, title: 'Verificar la consistencia', text: 'λmax, CI y CR: ¿se contradijeron los juicios? Se acepta con CR < 0.10.', where: 'Hoja 1, pasos 1.5 a 1.8, y S.1' },
  { no: 5, title: 'Repetir el juicio para las alternativas', text: 'Una matriz más por cada criterio, comparando las alternativas entre sí dentro de ese criterio.', where: 'Hojas 2 en adelante' },
  { no: 6, title: 'Síntesis: combinar todo en un ranking', text: 'Prioridad global = Σ (peso del criterio × prioridad local de la alternativa).', where: 'Pasos S.2 y S.3' },
];

export const AHP_GLOSSARY: { term: string; def: string }[] = [
  { term: 'Relación de preferencia', def: 'La respuesta a «¿A es más importante que B, y cuánto?» en la escala de Saaty. Cada celda de una matriz de comparación es una relación de preferencia.' },
  { term: 'Prioridad LOCAL', def: 'El peso de un elemento respecto a su padre inmediato en la jerarquía: el peso de un criterio entre los criterios, o el de una alternativa dentro de UN solo criterio.' },
  { term: 'Prioridad GLOBAL', def: 'El peso de una alternativa respecto al OBJETIVO, combinando todos los niveles: se obtiene multiplicando cada prioridad local por el peso de su criterio y sumando (la síntesis).' },
  { term: 'Prioridad FINAL', def: 'El resultado que se usa para decidir: las prioridades globales de todas las alternativas, ordenadas de mayor a menor.' },
];

export default function AhpProcessSteps({ mode, current, showGlossary = true, showWhere = false, title = 'El proceso AHP en 6 pasos' }: {
  mode: CalcMode;
  /** Paso(s) donde está la persona ahora (1 a 6): se marcan con «estás aquí», no solo con color. */
  current?: number | number[];
  showGlossary?: boolean;
  /** Muestra en qué pasos del desglose se ve cada paso (solo tiene sentido dentro de AhpBreakdown). */
  showWhere?: boolean;
  title?: string;
}) {
  const here = new Set(Array.isArray(current) ? current : current != null ? [current] : []);
  return (
    <div className={'ahp-proc' + (mode === 'report' ? ' ahp-proc-report' : '')}>
      <h4 className="ahp-proc-h">{title}</h4>
      <ol className="ahp-proc-list">
        {AHP_STEPS.map((s) => (
          <li key={s.no} className={'ahp-proc-li' + (here.has(s.no) ? ' is-here' : '')} aria-current={here.has(s.no) ? 'step' : undefined}>
            <span className="ahp-proc-no" aria-hidden="true">{s.no}</span>
            <span className="ahp-proc-tx">
              <b>{s.title}</b>
              {here.has(s.no) && <span className="ahp-here"> ◀ estás aquí</span>}
              <span className="ahp-proc-sub">{s.text}{showWhere && <> <i>Ver: {s.where}.</i></>}</span>
            </span>
          </li>
        ))}
      </ol>
      {showGlossary && (
        <>
          <h4 className="ahp-proc-h">Vocabulario: local, global y final</h4>
          <dl className="ahp-gloss">
            {AHP_GLOSSARY.map((g) => (
              <div key={g.term}><dt>{g.term}</dt><dd>{g.def}</dd></div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
