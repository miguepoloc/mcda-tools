/** Proyectos de ejemplo del geovisor. Se cargan con un botón (nunca automáticamente): el estudiante
 * decide si parte de cero o de un caso guiado.
 *
 * El único ejemplo con datos es la boya (caso real del artículo de 2021, con capas ya clasificadas
 * por el autor). El caso «aptitud cacaotera · Sierra Nevada» (notebook 07 de la Sesión 5) se retiró de
 * la plataforma el 28 sep 2026: su paquete (`snsm-cacao-v1`) combinaba capas derivadas de WorldClim
 * 2.1, cuya licencia (CC BY-NC-SA 4.0) prohíbe expresamente la redistribución. El notebook y el paquete
 * siguen existiendo fuera de este repositorio para trabajo local del docente; no se referencian aquí. */
import type { FnSpec } from './membership.ts';
import { uid } from '../types.ts';
import type { Criterion, GeoConfig } from '../types.ts';

export type ExampleId = 'boya-2021';
/** Expertos sembrados con el ejemplo (opcional). Solo respuestas reales del autor o, si se reconstruyen, marcadas expresamente como tales. */
export type ExampleExpert = { name: string; roleDesc: string; judgments: { key: string; value: number }[] };
export type Example = { id: string; source?: 'builtin' | 'catalog'; label: string; blurb: string; hasData: boolean; title: string; objective: string; criteria: Criterion[]; geo: GeoConfig; experts?: ExampleExpert[] };

/** Reglas del caso de la boya con datos: cada capa del paquete `boya-wsn-v1` ya trae la clase 1/2/3 del autor (1 apto · 2 moderado · 3 no apto)
 * y aquí se pasa a idoneidad 1 / 0.5 / 0. Con S = Σ wᵢ·sᵢ, «S del geovisor» = (3 − S del artículo)/2: los cortes 1.5 y 2.5 del resultado
 * original (`Final/Resultado.shp`) son idoneidad 0.75 y 0.25. */
export const BOYA_CLASS_SCORES = { '1': 1, '2': 0.5, '3': 0 };
export const BOYA_RULES: { layerKey: string; fn: FnSpec }[] = ['eco', 'trafico', 'pesca', 'bati'].map((layerKey) => ({ layerKey, fn: { type: 'classes', map: { ...BOYA_CLASS_SCORES } } }));
export const BOYA_CLASSES = { alta: 0.75, media: 0.25 };

/** Juicios de los 4 expertos de la encuesta de la tesis (`Datos_encuesta_sin_GSM.xlsx`, identidad reservada), en razones de Saaty para los pares
 * (1,2) (1,3) (1,4) (2,3) (2,4) (3,4) de [ecosistemas, tráfico, pesca, 4.º criterio]. Su media geométrica es EXACTAMENTE la Tabla IV del artículo
 * (hoja «Todo» del archivo; diferencia < 1e-15) y su eigenvector da los pesos publicados 0.5482 / 0.1423 / 0.2020 / 0.1075, CR 0.065.
 * Nota: en el archivo de la encuesta el 4.º criterio figura como «zonas de bañistas»; el autor confirmó (25 sep 2026) que es la zona batimétrica del
 * artículo y que esa etiqueta del archivo quedó sin actualizar. */
const BOYA_EXPERT_RATIOS: number[][] = [
  [5, 4, 7, 1 / 3, 4, 4],
  [9, 5, 7, 1, 3, 3],
  [6, 3, 5, 1, 3, 3],
  [1, 5, 1 / 3, 1 / 3, 1 / 3, 1],
];
const BOYA_PAIRS: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
/** razón de Saaty -> valor del control (negativo: gana el primero; |v|+1 = intensidad). */
const ratioToValue = (a: number) => (a >= 1 ? -(Math.round(a) - 1) : Math.round(1 / a) - 1);

function boyaDatos(): Example {
  const specs = [
    { name: 'Distancia a ecosistemas marinos', hint: 'Más lejos es mejor. Tabla VI del artículo: >150 m apto, 70–150 m moderado, <70 m no apto. La capa trae la clase 1/2/3 ya calculada por el autor con datos del SIAM/INVEMAR.' },
    { name: 'Distancia al tráfico marítimo', hint: 'Tabla VI: >100 m apto, 50–100 m moderado, <50 m no apto. Rutas de lanchas (Wikiloc) y de barcos (Shipmap).' },
    { name: 'Distancia a zonas de pesca', hint: 'Tabla VI: >1 milla náutica apto, menos de 1 milla moderado, dentro de la zona de pesca no apto (DIMAR / SMPOMM).' },
    { name: 'Zona batimétrica', hint: 'Tabla VI: 50–200 m apto, 20–50 m moderado, <20 m no apto. El área de estudio llega hasta la isóbata de 200 m.' },
  ];
  const criteria: Criterion[] = specs.map((s) => ({ id: uid('k'), name: s.name, hint: s.hint, src: null }));
  const rules: GeoConfig['rules'] = {};
  criteria.forEach((c, i) => { rules[c.id] = { layerKey: BOYA_RULES[i].layerKey, fn: BOYA_RULES[i].fn }; });
  return {
    id: 'boya-2021', label: 'Boya de monitoreo oceanográfico · con datos (artículo 2021)', hasData: true,
    blurb: 'Caso real de la tesis del docente (Polo-Castañeda et al., 2021): las clases 1/2/3 del autor a 250 m, las concesiones como exclusión y los 4 expertos de la encuesta (su media geométrica es la Tabla IV del artículo).',
    title: 'Zonas aptas para una boya de monitoreo oceanográfico (ejemplo del artículo de 2021)',
    objective: 'Determinar dónde instalar una red de sensores inalámbricos tipo boya en la zona de surgencia del Caribe sur (isóbata de 200 m), lejos de ecosistemas, tráfico marítimo y zonas de pesca, y sin las áreas de concesión.',
    criteria,
    geo: { packId: 'boya-wsn-v1', rules, classes: { ...BOYA_CLASSES } },
    experts: BOYA_EXPERT_RATIOS.map((ratios, e) => ({
      name: `Experto ${e + 1}`,
      roleDesc: 'Respuestas de la encuesta de la tesis (identidad reservada). Su media geométrica es la Tabla IV del artículo.',
      judgments: BOYA_PAIRS.map(([i, j], k) => ({ key: `${criteria[i].id}-${criteria[j].id}`, value: ratioToValue(ratios[k]) })),
    })),
  };
}

// Un solo ejemplo con datos por ahora (boya-2021); el parámetro queda por si se agrega otro.
export function buildExample(_id: ExampleId): Example {
  return { ...boyaDatos(), source: 'builtin' };
}
export const EXAMPLE_IDS: ExampleId[] = ['boya-2021'];
