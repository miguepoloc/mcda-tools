-- Plataforma MCDA: primera pieza de "Mapa de aptitud (SIG)" (geovisor AHP + SIG, ver
-- plataforma/docs/PLAN_geovisor_ahp_sig.md). Un proyecto espacial es kind:'spatial' con
-- method:'saw' (así JudgmentEditor/expert_get ya se comportan como se necesita, sin tocarlos: solo
-- muestran la hoja 'crit' cuando method != 'ahp' — comportamiento existente desde 0002). No hace
-- falta RLS nueva: `projects_owner` (0001_init.sql) ya es a nivel de fila, cubre estas columnas.
--
-- Deliberadamente NO en esta migración (quedan para una entrega siguiente, ver el plan):
--   - project_layers / geo_results / geo_packs / app_settings (carga de capas propias, publicar
--     resultado, cuota, catálogo editable desde /admin) — la v1 solo lee paquetes estáticos de
--     public/geo-packs/, generados por scripts/geo/export_pack.py, sin pasar por Supabase.
--   - exponer `kind` en expert_get/public_get — no hace falta todavía: el flujo de expertos no lo
--     usa, y un proyecto espacial no ofrece vista pública en esta entrega.

alter table public.projects
  add column if not exists kind text not null default 'decision' check (kind in ('decision', 'spatial')),
  add column if not exists geo jsonb not null default '{}'::jsonb;
