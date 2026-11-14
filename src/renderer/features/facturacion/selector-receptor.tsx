// "¿A quién se le factura?": consumidor final (sin datos), con DNI o con CUIT.
import { useEffect, useRef } from 'react';
import { cuitConGuiones, soloNumeros } from '@compartido/cuit';
import type { DatosReceptor } from '@compartido/esquemas';
import { esquemaReceptor } from '@compartido/esquemas';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type TipoReceptor = 'consumidor_final' | 'dni' | 'cuit';

export interface BorradorReceptor {
  tipo: TipoReceptor;
  numero: string;
  condicionIva: number;
}

export const RECEPTOR_INICIAL: BorradorReceptor = { tipo: 'consumidor_final', numero: '', condicionIva: 1 };

const OPCIONES: { tipo: TipoReceptor; texto: string }[] = [
  { tipo: 'consumidor_final', texto: 'Consumidor final' },
  { tipo: 'dni', texto: 'Con DNI' },
  { tipo: 'cuit', texto: 'Con CUIT' },
];

const CONDICIONES: { valor: number; texto: string }[] = [
  { valor: 1, texto: 'Responsable inscripto' },
  { valor: 6, texto: 'Monotributo' },
  { valor: 4, texto: 'IVA exento' },
  { valor: 5, texto: 'Consumidor final' },
];

/** Devuelve el receptor listo para enviar, o el mensaje de lo que falta corregir. */
export function validarReceptor(b: BorradorReceptor): { receptor: DatosReceptor } | { error: string } {
  const datos: DatosReceptor = { tipo: b.tipo, numero: b.numero, ...(b.tipo === 'cuit' ? { condicionIva: b.condicionIva } : {}) };
  const r = esquemaReceptor.safeParse(datos);
  return r.success ? { receptor: datos } : { error: r.error.issues[0]?.message ?? 'Revisá los datos del cliente.' };
}

export function SelectorReceptor({
  valor,
  alCambiar,
  error,
}: {
  valor: BorradorReceptor;
  alCambiar: (v: BorradorReceptor) => void;
  error?: string;
}) {
  const aviso = useRef<HTMLParagraphElement>(null);
  // Si el error queda debajo del pliegue del diálogo, se trae a la vista.
  useEffect(() => {
    if (error) aviso.current?.scrollIntoView?.({ block: 'nearest' });
  }, [error]);
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Cliente de la factura" className="grid grid-cols-3 gap-2">
        {OPCIONES.map((o) => {
          const activo = valor.tipo === o.tipo;
          return (
            <button
              key={o.tipo}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => alCambiar({ ...valor, tipo: o.tipo, numero: '' })}
              className={cn(
                'h-11 rounded-lg border text-[14px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                activo ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-linea-fuerte',
              )}
            >
              {o.texto}
            </button>
          );
        })}
      </div>
      {valor.tipo !== 'consumidor_final' && (
        <div className={cn('grid gap-3', valor.tipo === 'cuit' ? 'grid-cols-2' : 'grid-cols-1')}>
          <Input
            aria-label={valor.tipo === 'dni' ? 'DNI del cliente' : 'CUIT del cliente'}
            inputMode="numeric"
            autoComplete="off"
            placeholder={valor.tipo === 'dni' ? 'DNI (sin puntos)' : 'CUIT (20-12345678-3)'}
            value={valor.tipo === 'cuit' && soloNumeros(valor.numero).length === 11 ? cuitConGuiones(valor.numero) : valor.numero}
            aria-invalid={Boolean(error)}
            onChange={(e) => alCambiar({ ...valor, numero: e.target.value })}
            className="numeros"
          />
          {valor.tipo === 'cuit' && (
            <Select value={String(valor.condicionIva)} onValueChange={(v) => alCambiar({ ...valor, condicionIva: Number(v) })}>
              <SelectTrigger aria-label="Condición del cliente frente al IVA">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDICIONES.map((c) => (
                  <SelectItem key={c.valor} value={String(c.valor)}>
                    {c.texto}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {error && (
        <p ref={aviso} role="alert" className="text-[13px] font-semibold text-rojo">
          {error}
        </p>
      )}
    </div>
  );
}
