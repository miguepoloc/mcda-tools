-- Plataforma MCDA: agrega VIKOR, ELECTRE y PROMETHEE al conjunto de métodos válidos.
-- 0002_decision_matrix.sql ya está en producción con el check original (solo 'ahp'/'topsis'); no se
-- edita esa migración ya aplicada, se amplía acá. Los tres nuevos reusan exactamente el mismo
-- decision_matrix que ya usa TOPSIS (alternativas x criterios + tipo beneficio/costo) — ningún cambio
-- de esquema además de este check, ver plataforma/README.md § "Visión".

alter table public.projects drop constraint if exists projects_method_check;
alter table public.projects
  add constraint projects_method_check check (method in ('ahp', 'topsis', 'vikor', 'electre', 'promethee'));
