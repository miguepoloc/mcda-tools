import type { PrioState } from './prio.ts';

/** `unit`: unidad de los valores de este criterio en la matriz de decisión (km, años, USD, «escala 1–5»…). Vive en el JSON de `criteria`, sin migración. */
export type Criterion = { id: string; name: string; hint: string; src?: string | null; unit?: string };
export type Alternative = { id: string; name: string };
export type ExpertStatus = 'pending' | 'in_progress' | 'submitted';
/** 'ahp' = alternativas comparadas de a pares (como hasta ahora); los demás usan una matriz de
 * decisión cuantitativa + los mismos pesos de la hoja Criterios ('electre' NO da un ranking total,
 * da relaciones de superación con incomparabilidad posible). Ver plataforma/README.md § "Visión". */
export type Method = 'ahp' | 'topsis' | 'vikor' | 'electre' | 'promethee' | 'saw' | 'fuzzy_topsis';
/** Método para calcular los pesos de los criterios:
 * - 'ahp': pesos derivados de los juicios por pares de los expertos (comportamiento histórico).
 * - 'critic': pesos objetivos basados en correlación entre criterios (Diakoulaki et al., 1995).
 * - 'entropy': pesos objetivos basados en la entropía de Shannon de cada criterio.
 * Solo aplica cuando method !== 'ahp'; AHP siempre deriva sus propios pesos. */
export type WeightingMethod = 'ahp' | 'critic' | 'entropy';
export type MatrixType = 'max' | 'min';
/** Cómo se interpreta un criterio de la matriz de decisión: 'max' (beneficio, más es mejor), 'min' (costo, menos
 * es mejor) o 'target' (objetivo, "nominal-the-best" de Taguchi: lo óptimo es un valor específico, ver
 * `DecisionMatrix.targets`). Los métodos SOLO ven 'max'/'min': un criterio 'target' se convierte antes en su
 * distancia al objetivo, que es un costo normal (ver `resolveTargets` en topsis.ts). */
export type MatrixKind = MatrixType | 'target';
/** Objetivo de un criterio 'target': la distancia de un valor x es max(0, |x − value| − tol), es decir 0 dentro
 * de la banda value ± tol y la distancia al borde más cercano fuera de ella. tol = 0 → objetivo puntual. */
export type TargetSpec = { value: number; tol: number };
/** { values: { <altId>: { <critId>: number | string } }, types: { <critId>: 'max'|'min'|'target' } }.
 * Para fuzzy_topsis los valores son etiquetas lingüísticas ('VP'|'P'|'F'|'G'|'VG').
 * Para todos los demás métodos los valores son number. */
export type DecisionMatrix = {
  values: Record<string, Record<string, number | string>>;
  types: Record<string, MatrixKind>;
  /** Objetivo (y tolerancia) de cada criterio de tipo 'target'. Vive aquí, en el JSON de `decision_matrix`, sin
   * migración (ver vikorV). Un criterio 'target' sin objetivo válido cuenta como neutro (distancia 0) y la
   * interfaz avisa que falta. */
  targets?: Record<string, TargetSpec>;
  /** Solo VIKOR: v = peso de la estrategia de mayoría (S) frente al arrepentimiento (R), en [0, 1].
   * No se deriva de los datos, lo elige quien decide (Alidrisi 2021: 0.5 = "consenso" por convención).
   * Vive aquí, dentro del JSON de `decision_matrix`, para que `public_get`/`expert_get`, los respaldos
   * `.json` y la hoja `_datos` del Excel lo lleven sin migración. Si falta, se asume 0.5. */
  vikorV?: number;
  /** Solo ELECTRE: c* (concordancia mínima) y d* (discordancia máxima), ambos en [0, 1]. Igual que
   * vikorV, NO se derivan de los datos: los elige quien decide, según qué tan exigente quiera ser
   * (c* alto = más exigente, d* bajo = más exigente). Viven aquí sin migración; si faltan, rige el
   * valor por defecto de la plataforma (ver ELECTRE_C_STAR_DEFAULT/ELECTRE_D_STAR_DEFAULT en electre.ts). */
  electreCStar?: number;
  electreDStar?: number;
};

/** 'decision': proyecto de siempre (alternativas comparadas por AHP o rankeadas con una matriz de
 * decisión). 'spatial': "Mapa de aptitud (SIG)" — las alternativas son píxeles de un territorio, no
 * hay `alternatives` ni `decision_matrix`; `method` se fija en 'saw' solo para que el panel de
 * expertos reutilice el mecanismo ya existente de pesar criterios por pares (JudgmentEditor ya
 * muestra únicamente la hoja `crit` cuando `method !== 'ahp'`, sin cambios). La configuración propia
 * del mapa vive en `geo`. Ver plataforma/docs/PLAN_geovisor_ahp_sig.md. */
export type Kind = 'decision' | 'spatial';

/** Regla de idoneidad de un criterio espacial: ver `src/lib/geo/membership.ts` (FnSpec/VetoSpec) —
 * mismo tipo, repetido aquí porque `types.ts` no importa ese módulo (evita un ciclo con `ahp.ts`). */
export type GeoFnSpec =
  | { type: 'trapezoid'; a: number; b: number; c: number; d: number }
  | { type: 'up'; a: number; b: number }
  | { type: 'down'; a: number; b: number }
  | { type: 'classes'; map: Record<string, number> }
  | { type: 'steps'; breaks: number[]; scores: number[] }
  | { type: 'target'; value: number; tol: number; falloff: number };
export type GeoVetoSpec = { op: '<' | '>' | '<=' | '>='; value: number };

/** Grilla de análisis del proyecto: CRS métrico (UTM de la zona, o el del paquete del catálogo),
 * tamaño y afín GDAL [a,b,c,d,e,f]. Ver `src/lib/geo/grid.ts`. */
export type GeoGrid = {
  crs: string; width: number; height: number; resM: number; haPerPixel: number;
  transform: [number, number, number, number, number, number];
};

/** Capa propia ya alineada a la grilla, guardada como Float32 + gzip en Storage (`geo-layers`).
 * `role`: 'criterion' alimenta una regla; 'exclusion' (valor > 0 = excluido, p. ej. concesiones);
 * 'area' (valor > 0 = dentro del estudio, p. ej. la isóbata de 200 m). `origin` cuenta cómo se
 * derivó del archivo original (para mostrarlo en la UI, no se recalcula). */
export type GeoLayerMeta = {
  label: string; unit: string; role: 'criterion' | 'exclusion' | 'area';
  origin: string; source: string; min: number; max: number; path: string; bytes: number;
  /** Licencia / condiciones de uso del dato (texto libre; la fija el docente al publicar en el catálogo). */
  license?: string;
};

/** Configuración de un proyecto `kind:'spatial'`. Dos orígenes de datos: `packId` (paquete de
 * catálogo en `public/geo-packs/<id>`, solo lectura, generado por `scripts/geo/export_pack.py`) o
 * `grid` + `layers` (capas propias del estudiante). `rules` mapea el `id` de cada criterio de
 * `ProjectRow.criteria` a la capa que lo alimenta (`layerKey`) y su función de idoneidad; un
 * criterio sin regla no participa del cálculo. */
export type GeoConfig = {
  packId?: string;
  grid?: GeoGrid;
  layers?: Record<string, GeoLayerMeta>;
  rules: Record<string, { layerKey: string; fn: GeoFnSpec; veto?: GeoVetoSpec }>;
  classes: { alta: number; media: number };
  /** Área mínima (ha) de una parcela contigua de alta aptitud; 0 o ausente = sin filtro. */
  minPatchHa?: number;
};

export type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  objective: string;
  kind: Kind;
  method: Method;
  /** Cómo se calculan los pesos de criterios. Default 'ahp'. Solo relevante cuando method !== 'ahp'. */
  weighting_method: WeightingMethod;
  criteria: Criterion[];
  alternatives: Alternative[];
  decision_matrix: DecisionMatrix | Record<string, never>;
  prioritization: PrioState | Record<string, never>;
  /** Solo con kind:'spatial'. `{}` si el proyecto aún no se configuró (no debería pasar: se crea ya
   * con `geo` puesto — ver NewProject.tsx). */
  geo: GeoConfig | Record<string, never>;
  is_public: boolean;
  public_token: string;
  created_at: string;
  updated_at: string;
};

export type ExpertRow = {
  id: string;
  project_id: string;
  name: string;
  role_desc: string;
  invite_token: string;
  status: ExpertStatus;
  filled_by: 'expert' | 'owner';
  submitted_at: string | null;
  position: number;
};

export type JudgmentRow = { expert_id: string; sheet: string; pair_key: string; value: number };

export type ExpertGet = {
  expert: { name: string; role_desc: string; status: ExpertStatus };
  /** `weighting_method` aún NO lo devuelve expert_get (habría que añadirlo en una migración): se lee si llega, para que el flujo del
   * experto avise cuando el proyecto pasó a pesos objetivos (CRITIC/Entropía) y sus respuestas ya no cuentan. */
  project: { title: string; objective: string; method: Method; weighting_method?: WeightingMethod; criteria: Criterion[]; alternatives: Alternative[] };
  judgments: { sheet: string; pair_key: string; value: number }[];
};

export type PublicGet = {
  project: {
    title: string; objective: string; method: Method; weighting_method?: WeightingMethod; criteria: Criterion[]; alternatives: Alternative[];
    decision_matrix: DecisionMatrix | Record<string, never>;
  };
  experts: { id: string; label: string }[];
  judgments: JudgmentRow[];
};

/** Lo que devuelve admin_stats() (20240101000009_admin_v2.sql, amplía 20240101000007/000008):
 * agregados across-owner MÁS un puñado de listas con detalle individual (usuarios_historial,
 * proyectos_historial, proyectos_abandonados), aprobadas explícitamente el 22 sep 2026 — ver
 * README § Historial de cambios sobre por qué esto ya no es "solo agregados". La función revisa
 * el rol del solicitante por sí misma, así que si esto llega aquí es porque el RPC ya lo autorizó. */
export type AdminStats = {
  proyectos_total: number;
  proyectos_publicos: number;
  proyectos_privados: number;
  usuarios_total: number;
  expertos_total: number;
  expertos_pending: number;
  expertos_in_progress: number;
  expertos_submitted: number;
  criterios_total: number;
  alternativas_total: number;
  juicios_total: number;
  metodos: { metodo: Method; total: number }[];
  ponderacion: { metodo: WeightingMethod; total: number }[];
  expertos_filled_by: { quien: 'expert' | 'owner'; total: number }[];
  embudo_expertos: {
    invitados: number;
    empezaron: number;
    enviaron: number;
    avg_dias_invitado_a_empezar: number | null;
    avg_dias_empezar_a_enviar: number | null;
  };
  crecimiento_semanal: { semana: string; usuarios: number; proyectos: number; juicios: number }[];
  proyectos_abandonados: {
    id: string; titulo: string; dueño_email: string;
    creado: string; actualizado: string; expertos_total: number;
  }[];
  usuarios_historial: { email: string; nombre: string | null; creado: string }[];
  proyectos_historial: {
    id: string; titulo: string; dueño_email: string; metodo: Method; publico: boolean; creado: string;
  }[];
  rate_limit_picos: { funcion: string; pico_por_minuto: number; limite: number; cerca_del_limite: boolean }[];
  accesos_recientes: { email: string; fecha: string }[];
};

/** Estado de una cuenta (20240101000014_account_status.sql): `pausada` la pone y la quita el propio
 * usuario (volver a iniciar sesión la quita); `suspendida` solo un admin. */
export type AccountState = 'activa' | 'pausada' | 'suspendida';

/** Una fila de admin_users_activity(). `ultimo_acceso` es auth.users.last_sign_in_at: el último LOGIN,
 * no la última actividad (no cambia al renovarse el token); null = nunca inició sesión. */
export type AdminUserActivity = {
  id: string;
  email: string;
  nombre: string | null;
  rol: 'user' | 'admin';
  estado: AccountState;
  /** false = no abrió el enlace de confirmación del correo (un admin puede confirmarlo). */
  correo_confirmado: boolean;
  creado: string;
  ultimo_acceso: string | null;
  suspendida_el: string | null;
  pausada_el: string | null;
  proyectos: number;
};

export type AccountAction = 'suspend' | 'reactivate' | 'pause' | 'resume' | 'delete' | 'confirm_email';

/** Una fila de admin_account_events(): auditoría de suspensiones, pausas y eliminaciones. */
export type AdminAccountEvent = {
  fecha: string;
  accion: AccountAction;
  motivo: string | null;
  usuario_email: string | null;
  actor_email: string | null;
  autoservicio: boolean;
};

/** Lo que devuelve admin_ahp_raw() (20240101000009_admin_v2.sql): judgments crudos + criteria/
 * alternatives por proyecto, para que el admin corra la MISMA lógica de ahp.ts (expertMatrix/
 * analyze) en vez de reimplementarla en SQL. Ver computeAhpConsistency() en src/lib/admin.ts. */
export type AdminAhpRawProject = {
  project_id: string;
  criteria: Criterion[];
  alternatives: Alternative[];
  judgments: JudgmentRow[];
};

export const uid = (prefix = 'x') => prefix + Math.random().toString(36).slice(2, 8);
export const hexToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
