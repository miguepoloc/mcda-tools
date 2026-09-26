// Camina, de punta a punta y contra el Supabase REAL, el checklist de RLS que el README documenta
// como pendiente ("Qué está verificado y qué no"): crear cuenta, enlace de experto en "incógnito"
// (cliente aparte, sin sesión), acceso cruzado denegado entre cuentas, toggle de "público", y (nuevo,
// auditoría 20 sep 2026) el límite de frecuencia agregado en 20240101000006_rate_limit_and_constraints.sql.
//
// Efectos reales, no un mock: crea 2 cuentas nuevas en auth.users y un proyecto de prueba. El proyecto
// se borra solo al final; las 2 cuentas NO (la clave anon no puede borrar usuarios) — bórralas a mano
// desde Supabase > Authentication > Users si te importa dejar la base limpia.
//
// Requiere que "Confirm email" esté desactivado en Supabase > Authentication > Providers > Email
// (si no, signUp no entrega sesión inmediata y el script se detiene con instrucciones).
//
// Uso: node --env-file=.env.local --experimental-strip-types --no-warnings scripts/check-rls.ts

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  console.error('Corre con: node --env-file=.env.local --experimental-strip-types --no-warnings scripts/check-rls.ts');
  process.exit(1);
}

let failed = false;
function ok(cond: boolean, label: string) {
  console.log((cond ? 'OK   ' : 'FAIL ') + label);
  if (!cond) failed = true;
}

const stamp = Date.now();
const emailA = `rls-check-a-${stamp}@example.com`;
const emailB = `rls-check-b-${stamp}@example.com`;
const password = `Rls-Check-${stamp}-aA1!`;

async function main() {
  const clientA = createClient(url!, key!);
  const clientB = createClient(url!, key!);
  const anon = createClient(url!, key!);

  // 1. Crear cuenta e iniciar sesión.
  const { data: signA, error: signAErr } = await clientA.auth.signUp({ email: emailA, password });
  if (signAErr) { console.error('No se pudo crear la cuenta de prueba A:', signAErr.message); process.exit(1); }
  if (!signA.session) {
    console.error(
      'Cuenta A creada pero sin sesión inmediata: "Confirm email" está activo en Supabase Auth.\n' +
      'Desactívalo temporalmente (Authentication > Providers > Email > Confirm email) para correr este ' +
      'checklist, o confirma el correo manualmente y corre de nuevo.'
    );
    process.exit(1);
  }
  ok(true, 'Cuenta A creada e inició sesión');

  // 2. Crear un proyecto, agregar un experto, abrir su enlace (cliente "anon" = incógnito): responder y enviar.
  const { data: userA } = await clientA.auth.getUser();
  const { data: project, error: projErr } = await clientA
    .from('projects')
    .insert({
      owner_id: userA.user!.id,
      title: `RLS check ${stamp}`,
      objective: 'Verificación automática de RLS y rate limit (scripts/check-rls.ts)',
      criteria: [
        { id: 'k1', name: 'Criterio 1', hint: '', src: null },
        { id: 'k2', name: 'Criterio 2', hint: '', src: null },
      ],
      alternatives: [{ id: 'a1', name: 'Alternativa 1' }, { id: 'a2', name: 'Alternativa 2' }],
    })
    .select('id, public_token')
    .single();
  if (projErr || !project) { console.error('No se pudo crear el proyecto:', projErr?.message); process.exit(1); }
  ok(true, 'Proyecto de prueba creado');

  const { data: expert, error: expErr } = await clientA
    .from('experts')
    .insert({ project_id: project.id, name: 'Experto de prueba (check-rls)' })
    .select('invite_token')
    .single();
  if (expErr || !expert) { console.error('No se pudo crear el experto:', expErr?.message); process.exit(1); }
  ok(true, 'Experto de prueba creado');

  const { data: eg, error: egErr } = await anon.rpc('expert_get', { p_token: expert.invite_token });
  ok(!egErr && !!eg, 'expert_get responde con el token del experto (sin sesión, como en /e/[token])');

  const { error: esErr } = await anon.rpc('expert_save', {
    p_token: expert.invite_token, p_sheet: 'crit', p_pair: 'k1-k2', p_value: 2,
  });
  ok(!esErr, 'expert_save guarda un juicio con el token del experto');

  const { error: subErr } = await anon.rpc('expert_submit', { p_token: expert.invite_token });
  ok(!subErr, 'expert_submit marca las respuestas como enviadas');

  const { data: badGet } = await anon.rpc('expert_get', { p_token: 'token-que-no-existe-' + stamp });
  ok(badGet === null, 'expert_get con token inválido devuelve null (no filtra datos de otro proyecto)');

  // 3. Con OTRA cuenta, /projects/<id> del primer usuario debe ser invisible (RLS cross-tenant).
  const { data: signB, error: signBErr } = await clientB.auth.signUp({ email: emailB, password });
  if (signBErr || !signB.session) {
    console.error('No se pudo crear/loguear la cuenta de prueba B:', signBErr?.message ?? 'sin sesión');
    process.exit(1);
  }
  const { data: crossRead, error: crossErr } = await clientB
    .from('projects').select('id').eq('id', project.id).maybeSingle();
  ok(!crossErr && crossRead === null, 'La cuenta B NO puede leer el proyecto de la cuenta A (RLS cruzada)');

  // 4. Activar "público": debe verse por token, sin nombres de expertos. Desactivar: deja de verse.
  await clientA.from('projects').update({ is_public: true }).eq('id', project.id);
  const { data: pub1 } = await anon.rpc('public_get', { p_token: project.public_token });
  ok(!!pub1, 'public_get devuelve datos cuando is_public = true');
  const pubExperts: Array<{ label: string }> = (pub1 as { experts?: Array<{ label: string }> } | null)?.experts ?? [];
  ok(!pubExperts.some((e) => e.label === 'Experto de prueba (check-rls)'),
    'public_get NO expone el nombre real del experto (solo su rol o "Experto N")');

  await clientA.from('projects').update({ is_public: false }).eq('id', project.id);
  const { data: pub2 } = await anon.rpc('public_get', { p_token: project.public_token });
  ok(pub2 === null, 'public_get devuelve null en cuanto is_public = false (deja de verse al instante)');

  // 5. Límite de frecuencia (20240101000006_rate_limit_and_constraints.sql): >60 expert_get/min al
  //    mismo token debe empezar a fallar.
  let sawRateLimit = false;
  for (let i = 0; i < 65; i++) {
    const { error } = await anon.rpc('expert_get', { p_token: expert.invite_token });
    if (error) { sawRateLimit = true; break; }
  }
  ok(sawRateLimit, 'El límite de frecuencia corta expert_get tras ~60 llamadas/minuto al mismo token');

  // Limpieza: el proyecto se borra (cascada: experts, judgments). Las 2 cuentas quedan (ver cabecera).
  await clientA.from('projects').delete().eq('id', project.id);
  console.log(
    `\nProyecto de prueba eliminado. Cuentas de prueba (quedan en auth.users, bórralas a mano si quieres):\n` +
    `  ${emailA}\n  ${emailB}`
  );

  console.log(failed ? '\nHay fallos arriba — revisa RLS/las funciones antes de confiar en este flujo.' : '\nTodo el checklist de RLS + rate limit pasó.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
