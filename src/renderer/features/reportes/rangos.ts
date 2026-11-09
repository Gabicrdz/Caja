// Los períodos rápidos del filtro (Hoy, 7 días, Este mes…) y cómo se leen.
import { fechaISO, sumarDias } from '@/lib/utils';
import type { Columna } from '@/components/graficos/columnas';
import type { VentasDelDia } from '@compartido/tipos';
import { pesos } from '@compartido/dinero';

export const PERIODOS = [
  { id: 'hoy', nombre: 'Hoy' },
  { id: 'ayer', nombre: 'Ayer' },
  { id: '7dias', nombre: '7 días' },
  { id: '30dias', nombre: '30 días' },
  { id: 'mes', nombre: 'Este mes' },
  { id: 'mes-pasado', nombre: 'Mes pasado' },
] as const;
export type Periodo = (typeof PERIODOS)[number]['id'];

export interface Rango {
  desde: string;
  hasta: string;
}

export function rangoDe(periodo: Periodo, hoy: string = fechaISO()): Rango {
  const [anio, mes] = hoy.split('-').map(Number) as [number, number];
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case 'ayer':
      return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) };
    case '7dias':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case '30dias':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case 'mes':
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    case 'mes-pasado': {
      const primero = fechaISO(new Date(anio, mes - 2, 1));
      const ultimo = fechaISO(new Date(anio, mes - 1, 0)); // día 0 = último del mes anterior
      return { desde: primero, hasta: ultimo };
    }
  }
}

const aFecha = (f: string) => new Date(`${f}T12:00:00`);
const dia = (f: string, opciones: Intl.DateTimeFormatOptions) => aFecha(f).toLocaleDateString('es-AR', opciones);

/** "hoy" · "lunes 9 de noviembre" · "3 al 9 de noviembre" · "28 de octubre al 3 de noviembre". */
export function textoRango({ desde, hasta }: Rango, hoy: string = fechaISO()): string {
  const conAnio = desde.slice(0, 4) !== hoy.slice(0, 4) || hasta.slice(0, 4) !== hoy.slice(0, 4);
  const anio: Intl.DateTimeFormatOptions = conAnio ? { year: 'numeric' } : {};
  if (desde === hasta) {
    if (desde === hoy) return 'hoy';
    return dia(desde, { weekday: 'long', day: 'numeric', month: 'long', ...anio });
  }
  if (desde.slice(0, 7) === hasta.slice(0, 7)) {
    return `${dia(desde, { day: 'numeric' })} al ${dia(hasta, { day: 'numeric', month: 'long', ...anio })}`;
  }
  return `${dia(desde, { day: 'numeric', month: 'long', ...anio })} al ${dia(hasta, { day: 'numeric', month: 'long', ...anio })}`;
}

export function textoAnterior(dias: number): string {
  return dias === 1 ? 'el día anterior' : `los ${dias} días anteriores`;
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`;
export const textoPedidos = (n: number) => plural(n, 'pedido', 'pedidos');

/**
 * Las columnas del gráfico de ventas: un día por columna hasta 2 meses;
 * con más días, se juntan por mes (365 columnas no se leen).
 */
export function columnasDeVentas(porDia: VentasDelDia[]): Columna[] {
  if (porDia.length > 62) {
    const meses = new Map<string, { ventas: number; pedidos: number }>();
    for (const d of porDia) {
      const clave = d.fecha.slice(0, 7);
      const m = meses.get(clave) ?? { ventas: 0, pedidos: 0 };
      m.ventas += d.ventasCentavos;
      m.pedidos += d.pedidos;
      meses.set(clave, m);
    }
    return [...meses].map(([clave, m]) => ({
      clave,
      etiqueta: dia(`${clave}-01`, { month: 'short' }).replace('.', ''),
      titulo: dia(`${clave}-01`, { month: 'long', year: 'numeric' }),
      valor: m.ventas,
      detalle: textoPedidos(m.pedidos),
    }));
  }
  const corto = porDia.length <= 14;
  return porDia.map((d) => ({
    clave: d.fecha,
    etiqueta: corto
      ? `${dia(d.fecha, { weekday: 'short' }).replace('.', '')} ${Number(d.fecha.slice(8))}`
      : `${Number(d.fecha.slice(8))}/${Number(d.fecha.slice(5, 7))}`,
    titulo: dia(d.fecha, { weekday: 'long', day: 'numeric', month: 'long' }),
    valor: d.ventasCentavos,
    detalle: textoPedidos(d.pedidos),
  }));
}

export const tablaDeVentas = (columnas: Columna[]) => ({
  columnas: ['Período', 'Pedidos', 'Ventas'],
  filas: columnas.map((c) => [c.titulo, (c.detalle ?? '').replace(/ pedidos?$/, ''), pesos(c.valor)]),
});
