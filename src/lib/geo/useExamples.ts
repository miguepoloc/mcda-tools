'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildExample, EXAMPLE_IDS, type Example } from './examples';
import { catalogExample, listCatalog } from './catalog';

/** Ejemplos integrados + paquetes activos del catálogo del docente (si hay sesión). */
export function useExamples(sb: SupabaseClient | null): Example[] {
  const [items, setItems] = useState<Example[]>(() => EXAMPLE_IDS.map(buildExample));
  useEffect(() => {
    if (!sb) return;
    let alive = true;
    listCatalog(sb).then((rows) => { if (alive) setItems([...EXAMPLE_IDS.map(buildExample), ...rows.filter((r) => r.is_active).map(catalogExample)]); });
    return () => { alive = false; };
  }, [sb]);
  return items;
}
