// Una sola fuente para "hoy" y "ahora" (como en el gimnasio): la hora la
// calcula JavaScript con la zona horaria de la computadora y se la pasamos a
// SQLite. Las pruebas pueden mandar otra fecha para simular otros días.

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** 'AAAA-MM-DD' en hora local. */
export function fechaLocal(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`;
}

/** 'HH:MM' en hora local. */
export function horaLocal(fecha: Date = new Date()): string {
  return `${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`;
}

/** 'AAAA-MM-DD HH:MM:SS' en hora local (para abrir y cerrar cajas). */
export function momentoLocal(fecha: Date = new Date()): string {
  return `${fechaLocal(fecha)} ${horaLocal(fecha)}:${dosCifras(fecha.getSeconds())}`;
}
