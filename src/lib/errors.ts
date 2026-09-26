// Traduce errores de Supabase/Postgres a mensajes seguros para mostrar al usuario.
// El error crudo (que puede incluir nombres de tabla/columna/política) solo va a la consola.
export function friendlyError(error: unknown, fallback = 'Ocurrió un error. Intenta de nuevo.'): string {
  let raw = '';
  if (error && typeof error === 'object' && 'message' in error) {
    raw = String((error as { message?: unknown }).message ?? '');
  } else if (error instanceof Error) {
    raw = error.message;
  }
  if (raw) console.error('[mcda]', raw, error);
  else if (error !== undefined) console.error('[mcda]', error);

  if (/banned|user is suspended/i.test(raw)) return 'Tu cuenta está suspendida. Escribe al docente para revisarlo.';
  if (/cuenta no activa/i.test(raw)) return 'Tu cuenta no está activa. Vuelve a iniciar sesión o escribe al docente.';
  if (/invalid login credentials/i.test(raw)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(raw)) return 'Confirma tu correo antes de iniciar sesión.';
  if (/row-level security|permission denied/i.test(raw)) return 'No tienes permiso para esta acción.';
  if (/duplicate key|unique constraint/i.test(raw)) return 'Ya existe un registro con esos datos.';
  if (/jwt|not authenticated|session/i.test(raw)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (/failed to fetch|network/i.test(raw)) return 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.';
  return fallback;
}
