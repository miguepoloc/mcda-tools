// Caso de las diapositivas 15-18 de la Sesión 1 (tecnología IoT/WSN en Palmor), compartido por los checks de la Parte A.
import { blankPrio, newCand, type PrioState } from '../src/lib/prio.ts';

export function slideCase(): PrioState {
  const names = ['Alcance', 'Consumo energético', 'Infraestructura en Colombia', 'Madurez del ecosistema', 'Tasa de datos', 'Costo por nodo', 'Escalabilidad',
    'Facilidad de despliegue', 'Latencia', 'Seguridad'];
  const A0: PrioState = { ...blankPrio(), mode: 'q', cutoff: 4 };
  A0.cands = names.map((n, i) => newCand('c' + i, n));
  // 5 preguntas de evidencia: promedios 5.0, 4.8, 4.6, 4.2, 3.8, 3.0, 2.6
  const sq: Record<string, number[]> = {
    c0: [5, 5, 5, 5, 5], c1: [5, 5, 5, 5, 4], c2: [5, 5, 5, 4, 4], c3: [5, 4, 4, 4, 4], c4: [4, 4, 4, 4, 3], c5: [3, 3, 3, 3, 3], c6: [3, 3, 3, 2, 2],
  };
  for (const [id, v] of Object.entries(sq)) A0.cands.find((c) => c.id === id)!.sq = v;
  // tamizaje: «Facilidad de despliegue» se funde con «Infraestructura»
  Object.assign(A0.cands[7], { stage: 'merge', at: 'tam', target: 'c2', reason: 'En zona rural depende de la red comercial existente', evid: 'Ficha técnica' });
  // independencia: Latencia y Seguridad se descartan (en la UI solo se puede «fusionar» aquí; el modelo admite ambas)
  Object.assign(A0.cands[8], { stage: 'drop', at: 'ind', reason: 'Irrelevante para sensores que muestrean cada minutos u horas' });
  Object.assign(A0.cands[9], { stage: 'merge', at: 'ind', target: 'c0', reason: 'Cifrado equivalente' });
  return A0;
}
