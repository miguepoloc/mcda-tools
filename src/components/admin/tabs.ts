// Sin 'use client': la página del servidor lee ADMIN_TABS (un valor, no un componente); si viviera en el archivo
// cliente de AdminTabs, el servidor recibiría una referencia opaca en lugar del arreglo.
export type AdminTab = 'resumen' | 'usuarios' | 'proyectos' | 'seguridad' | 'mapas';

export const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'mapas', label: 'Mapas' },
];
