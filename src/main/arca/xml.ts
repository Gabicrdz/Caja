// Armar y leer los XML de ARCA con texto simple. Las respuestas son chicas y de forma fija,
// así que no hace falta una librería de XML.

export function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function desescapar(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Contenido del primer <nombre>…</nombre> (ignora prefijos de espacio de nombres). */
export function etiqueta(xml: string, nombre: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`).exec(xml);
  return m ? m[1]!.trim() : null;
}

/** Todos los <nombre>…</nombre>. */
export function etiquetas(xml: string, nombre: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]!.trim());
}
