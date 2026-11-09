// Gráfico de columnas hecho a mano con SVG (sin librerías): así controlamos
// cada detalle y no sumamos dependencias. Reglas que sigue (guía de dataviz):
// - columnas finas (24 px como mucho), punta redondeada de 4 px y base recta;
// - un solo eje, que arranca en 0, con 3 o 4 líneas de guía finitas;
// - solo se escribe el valor de la columna más alta (el resto, en el eje,
//   el tooltip y la tabla);
// - pasar el mouse o llegar con Tab muestra el detalle (tooltip).
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface Columna {
  clave: string;
  /** Texto corto debajo de la columna ("lun 3", "21 h"). */
  etiqueta: string;
  /** Texto largo para el tooltip ("lunes 3 de noviembre"). */
  titulo: string;
  valor: number;
  /** Segunda línea del tooltip ("12 pedidos"). */
  detalle?: string;
}

interface Props {
  columnas: Columna[];
  /** Nombre del gráfico para lectores de pantalla. */
  nombre: string;
  formatear: (valor: number) => string;
  formatearEje: (valor: number) => string;
  alto?: number;
}

const MARGEN = { arriba: 24, derecha: 4, abajo: 28, izquierda: 64 };
const ANCHO_MAXIMO = 24;
const RADIO = 4;

/** Un "techo" redondo para el eje: 0, 5 mil, 10 mil, 15 mil… */
export function escalaLinda(maximo: number, marcas = 4): { tope: number; paso: number } {
  if (maximo <= 0) return { tope: 1, paso: 1 };
  const bruto = maximo / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  return { tope: Math.ceil(maximo / paso) * paso, paso };
}

/** Columna con la punta redondeada y la base recta (crece desde el 0). */
function caminoColumna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, ancho / 2, alto);
  return [
    `M${x},${y + alto}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + ancho - r}`,
    `Q${x + ancho},${y} ${x + ancho},${y + r}`,
    `V${y + alto}`,
    'Z',
  ].join(' ');
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAncho(el.clientWidth);
    const observador = new ResizeObserver(([entrada]) => setAncho(entrada?.contentRect.width ?? 0));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return [ref, ancho] as const;
}

export function GraficoColumnas({ columnas, nombre, formatear, formatearEje, alto = 240 }: Props) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [activa, setActiva] = useState<number | null>(null);

  const anchoPlot = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha);
  const altoPlot = alto - MARGEN.arriba - MARGEN.abajo;
  const maximo = Math.max(0, ...columnas.map((c) => c.valor));
  const { tope, paso } = escalaLinda(maximo);
  const banda = columnas.length ? anchoPlot / columnas.length : 0;
  // Entre columnas siempre queda aire (y como mínimo 2 px de "hueco").
  const anchoColumna = Math.max(1, Math.min(ANCHO_MAXIMO, banda * 0.62, banda - 2));
  const y = (v: number) => MARGEN.arriba + altoPlot - (v / tope) * altoPlot;
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const indiceMaximo = maximo > 0 ? columnas.findIndex((c) => c.valor === maximo) : -1;

  // Etiquetas de abajo: si no entran todas, mostramos 1 de cada N.
  const largoEtiqueta = Math.max(...columnas.map((c) => c.etiqueta.length), 1) * 6.5 + 10;
  const cadaN = Math.max(1, Math.ceil(largoEtiqueta / Math.max(banda, 1)));

  const activaDatos = activa !== null ? columnas[activa] : undefined;
  const xCentro = (i: number) => MARGEN.izquierda + banda * i + banda / 2;

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }} onPointerLeave={() => setActiva(null)}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="group" aria-label={nombre} className="block overflow-visible">
          {/* Guías horizontales y valores del eje */}
          {marcas.map((m) => (
            <g key={m}>
              <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(m)} y2={y(m)} stroke="var(--linea)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={MARGEN.izquierda - 10} y={y(m)} dy="0.32em" textAnchor="end" className="numeros fill-tinta-suave text-[12px]">
                {formatearEje(m)}
              </text>
            </g>
          ))}

          {columnas.map((c, i) => {
            const altoColumna = (c.valor / tope) * altoPlot;
            const x = xCentro(i) - anchoColumna / 2;
            const encendida = activa === i;
            return (
              <g key={c.clave}>
                {c.valor > 0 && (
                  <path
                    d={caminoColumna(x, y(c.valor), anchoColumna, altoColumna)}
                    className={cn('transition-colors', encendida ? 'fill-dato-activo' : 'fill-dato')}
                  />
                )}
                {i === indiceMaximo && (
                  <text x={xCentro(i)} y={y(c.valor) - 8} textAnchor="middle" className="numeros fill-tinta text-[12px] font-semibold">
                    {formatearEje(c.valor)}
                  </text>
                )}
                {i % cadaN === 0 && (
                  <text x={xCentro(i)} y={alto - 8} textAnchor="middle" className={cn('text-[12px]', encendida ? 'fill-tinta font-semibold' : 'fill-tinta-suave')}>
                    {c.etiqueta}
                  </text>
                )}
                {/* Zona para el mouse: toda la franja, no solo la columna pintada */}
                <rect
                  x={MARGEN.izquierda + banda * i}
                  y={MARGEN.arriba}
                  width={banda}
                  height={altoPlot}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${c.titulo}: ${formatear(c.valor)}${c.detalle ? `, ${c.detalle}` : ''}`}
                  onPointerEnter={() => setActiva(i)}
                  onFocus={() => setActiva(i)}
                  onBlur={() => setActiva(null)}
                  className="outline-none"
                />
              </g>
            );
          })}
          {/* Línea de base */}
          <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(0)} y2={y(0)} stroke="var(--linea-fuerte)" strokeWidth={1} shapeRendering="crispEdges" />
        </svg>
      )}

      {activaDatos && activa !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-tinta px-3 py-2 text-white shadow-lg"
          style={{
            left: Math.min(Math.max(xCentro(activa), 90), ancho - 90),
            top: Math.max(y(activaDatos.valor) - 10, 46),
          }}
        >
          <p className="numeros text-[15px] font-semibold whitespace-nowrap">{formatear(activaDatos.valor)}</p>
          <p className="text-[12px] whitespace-nowrap text-white/70">
            {activaDatos.titulo}
            {activaDatos.detalle ? ` · ${activaDatos.detalle}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}
