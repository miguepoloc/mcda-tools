-- Plataforma MCDA: agrega SAW y Fuzzy TOPSIS al conjunto de métodos válidos, y la columna
-- weighting_method para elegir cómo calcular los pesos de criterios (AHP, CRITIC, Entropía).
-- 0003_more_methods.sql ya está en producción; no se edita esa migración, se amplía acá.

alter table public.projects drop constraint if exists projects_method_check;
alter table public.projects
  add constraint projects_method_check check (
    method in ('ahp', 'topsis', 'vikor', 'electre', 'promethee', 'saw', 'fuzzy_topsis')
  );

-- Método de ponderación objetiva (default 'ahp' = pesos de la hoja Criterios, comportamiento actual).
alter table public.projects
  add column if not exists weighting_method text not null default 'ahp'
    check (weighting_method in ('ahp', 'critic', 'entropy'));
