// Marco común de cada gráfico: título, una línea de ayuda y el botón para
// verlo como TABLA (los mismos números, sin depender de colores ni del mouse).
import { useState, type ReactNode } from 'react';
import { ChartColumn, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DatosTabla {
  columnas: string[];
  filas: (string | number)[][];
}

interface Props {
  titulo: string;
  descripcion?: string;
  tabla?: DatosTabla;
  acciones?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function TarjetaGrafico({ titulo, descripcion, tabla, acciones, className, children }: Props) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className={cn('flex flex-col rounded-2xl border border-linea bg-superficie p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight">{titulo}</h2>
          {descripcion && <p className="text-[13px] text-tinta-suave">{descripcion}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {acciones}
          {tabla && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVerTabla((v) => !v)}
              aria-pressed={verTabla}
              aria-label={verTabla ? `Ver ${titulo} como gráfico` : `Ver ${titulo} como tabla`}
              className="text-tinta-suave"
            >
              {verTabla ? <ChartColumn /> : <Table2 />}
              {verTabla ? 'Gráfico' : 'Tabla'}
            </Button>
          )}
        </div>
      </header>
      {verTabla && tabla ? <TablaSimple {...tabla} /> : children}
    </section>
  );
}

function TablaSimple({ columnas, filas }: DatosTabla) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-[14px]">
        <thead className="sticky top-0 bg-superficie">
          <tr className="border-b border-linea text-left text-[12px] text-tinta-suave">
            {columnas.map((c, i) => (
              <th key={c} scope="col" className={cn('py-2 font-semibold', i > 0 && 'text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-linea last:border-0">
              {f.map((celda, j) => (
                <td key={j} className={cn('py-1.5', j > 0 && 'numeros text-right')}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
