import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleAlert, Plus, Trash2, X } from 'lucide-react';
import type { GrupoAgregados } from '@compartido/tipos';
import { leerPesos, pesosParaCampo } from '@compartido/dinero';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { caja } from '@/lib/api';
import { useAccion } from './consultas';
import { reglaDelGrupo } from './textos';

// Las cuatro reglas que se usan casi siempre, como botones.
const REGLAS = [
  { clave: 'uno-obligatorio', titulo: 'Elegir uno', detalle: 'Obligatorio. Ej.: punto de la carne', minimo: 1, maximo: 1 },
  { clave: 'uno-opcional', titulo: 'Uno, si quiere', detalle: 'Opcional. Ej.: tipo de leche', minimo: 0, maximo: 1 },
  { clave: 'varios-opcional', titulo: 'Varios, si quiere', detalle: 'Opcional. Ej.: extras', minimo: 0, maximo: null },
  { clave: 'personalizada', titulo: 'Personalizada', detalle: 'Mínimo y máximo a mano', minimo: null, maximo: null },
] as const;
type ClaveRegla = (typeof REGLAS)[number]['clave'];

function reglaDe(minimo: number, maximo: number | null): ClaveRegla {
  const encontrada = REGLAS.find((r) => r.clave !== 'personalizada' && r.minimo === minimo && r.maximo === maximo);
  return encontrada?.clave ?? 'personalizada';
}

const esquemaFormulario = z
  .object({
    nombre: z.string().trim().min(1, 'Escribí el nombre del grupo.').max(40, 'Máximo 40 caracteres.'),
    regla: z.enum(['uno-obligatorio', 'uno-opcional', 'varios-opcional', 'personalizada']),
    minimo: z.string(),
    maximo: z.string(),
    opciones: z
      .array(
        z.object({
          id: z.number().optional(),
          nombre: z.string().trim().min(1, 'Falta el nombre.').max(40, 'Máximo 40 caracteres.'),
          precio: z.string().refine((t) => t.trim() === '' || leerPesos(t) !== null, 'Precio inválido.'),
        }),
      )
      .min(1, 'Agregá al menos una opción.'),
  })
  .superRefine((f, ctx) => {
    if (f.regla !== 'personalizada') return;
    const min = Number(f.minimo);
    const max = f.maximo.trim() === '' ? null : Number(f.maximo);
    if (!/^\d{1,2}$/.test(f.minimo)) ctx.addIssue({ code: 'custom', path: ['minimo'], message: 'Número de 0 a 20.' });
    if (max !== null && (!/^\d{1,2}$/.test(f.maximo.trim()) || max < 1)) {
      ctx.addIssue({ code: 'custom', path: ['maximo'], message: 'Número de 1 a 20, o vacío.' });
    } else if (max !== null && max < min) {
      ctx.addIssue({ code: 'custom', path: ['maximo'], message: 'No puede ser menor que el mínimo.' });
    }
  });
type Formulario = z.infer<typeof esquemaFormulario>;

function valoresIniciales(g: GrupoAgregados | null): Formulario {
  return {
    nombre: g?.nombre ?? '',
    regla: g ? reglaDe(g.minimo, g.maximo) : 'varios-opcional',
    minimo: String(g?.minimo ?? 0),
    maximo: g?.maximo === null || g === null ? '' : String(g.maximo),
    opciones: g?.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precio: o.precioCentavos ? pesosParaCampo(o.precioCentavos) : '' })) ?? [
      { nombre: '', precio: '' },
    ],
  };
}

interface Props {
  abierto: boolean;
  grupo: GrupoAgregados | null;
  alCerrar: () => void;
  alDarDeBaja: (g: GrupoAgregados) => void;
}

export function EditorGrupo({ abierto, grupo, alCerrar, alDarDeBaja }: Props) {
  const [errorServidor, setErrorServidor] = useState('');
  const guardar = useAccion(caja().grupos.guardar, {
    exito: grupo ? 'Grupo actualizado' : 'Grupo creado',
    avisarError: false,
  });
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Formulario>({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: valoresIniciales(grupo),
  });
  const opciones = useFieldArray({ control, name: 'opciones' });
  const regla = watch('regla');
  const [minimo, maximo] = watch(['minimo', 'maximo']);

  useEffect(() => {
    if (abierto) {
      reset(valoresIniciales(grupo));
      setErrorServidor('');
    }
  }, [abierto, grupo, reset]);

  const enviar = handleSubmit(async (f) => {
    const elegida = REGLAS.find((r) => r.clave === f.regla)!;
    const min = elegida.clave === 'personalizada' ? Number(f.minimo) : elegida.minimo;
    const max = elegida.clave === 'personalizada' ? (f.maximo.trim() === '' ? null : Number(f.maximo)) : elegida.maximo;
    setErrorServidor('');
    try {
      await guardar.mutateAsync([
        {
          id: grupo?.id,
          nombre: f.nombre,
          minimo: min ?? 0,
          maximo: max,
          opciones: f.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioCentavos: o.precio.trim() === '' ? 0 : leerPesos(o.precio)! })),
        },
      ]);
      alCerrar();
    } catch (e) {
      setErrorServidor((e as Error).message);
    }
  });

  const resumen =
    regla === 'personalizada'
      ? /^\d{1,2}$/.test(minimo) && (maximo.trim() === '' || /^\d{1,2}$/.test(maximo.trim()))
        ? reglaDelGrupo({ minimo: Number(minimo), maximo: maximo.trim() === '' ? null : Number(maximo) })
        : ''
      : null;

  return (
    <Dialog open={abierto} onOpenChange={(abrir) => !abrir && alCerrar()}>
      <DialogContent className="max-w-[680px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{grupo ? 'Editar grupo de agregados' : 'Nuevo grupo de agregados'}</DialogTitle>
            <DialogDescription>Una pregunta que se hace al vender, con sus opciones y lo que cuesta cada una.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-7">
            {errorServidor && (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-rojo-suave px-4 py-3 font-medium text-rojo">
                <CircleAlert className="mt-0.5 size-[18px] shrink-0" />
                {errorServidor}
              </div>
            )}
            <Campo etiqueta="Nombre" htmlFor="g-nombre" error={errors.nombre?.message}>
              <Input id="g-nombre" autoFocus maxLength={40} placeholder="Por ejemplo: Extras de hamburguesa" aria-invalid={Boolean(errors.nombre)} {...register('nombre')} />
            </Campo>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm font-semibold">¿Cuántas opciones se pueden elegir?</legend>
              <div role="radiogroup" aria-label="Regla" className="grid grid-cols-4 gap-2">
                {REGLAS.map((r) => (
                  <button
                    key={r.clave}
                    type="button"
                    role="radio"
                    aria-checked={regla === r.clave}
                    onClick={() => setValue('regla', r.clave)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                      regla === r.clave ? 'border-tinta bg-[#fafaf8] shadow-[inset_0_0_0_1px_var(--tinta)]' : 'border-linea hover:border-linea-fuerte',
                    )}
                  >
                    <span className="text-sm font-semibold">{r.titulo}</span>
                    <span className="text-[12px] leading-snug text-tinta-suave">{r.detalle}</span>
                  </button>
                ))}
              </div>
              {regla === 'personalizada' && (
                <div className="flex items-start gap-3">
                  <Campo etiqueta="Mínimo" htmlFor="g-min" error={errors.minimo?.message} className="w-28">
                    <Input id="g-min" inputMode="numeric" className="numeros" {...register('minimo')} />
                  </Campo>
                  <Campo etiqueta="Máximo" htmlFor="g-max" error={errors.maximo?.message} ayuda="Vacío = sin límite" className="w-40">
                    <Input id="g-max" inputMode="numeric" className="numeros" {...register('maximo')} />
                  </Campo>
                  {resumen && <p className="mt-9 text-sm text-tinta-suave">Queda: {resumen}</p>}
                </div>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-3 text-sm font-semibold">Opciones</legend>
              <div className="grid grid-cols-[1fr_180px_44px] gap-2 px-0.5 text-[13px] text-tinta-suave">
                <span>Nombre</span>
                <span>Precio adicional</span>
              </div>
              <ul className="flex flex-col gap-2">
                {opciones.fields.map((campo, i) => (
                  <li key={campo.id} className="grid grid-cols-[1fr_180px_44px] items-start gap-2">
                    <div className="flex flex-col gap-1">
                      <Input aria-label={`Opción ${i + 1}`} maxLength={40} placeholder={['Cheddar', 'Panceta', 'Huevo'][i] ?? 'Opción'} aria-invalid={Boolean(errors.opciones?.[i]?.nombre)} {...register(`opciones.${i}.nombre`)} />
                      {errors.opciones?.[i]?.nombre && <p className="text-[13px] font-medium text-rojo">{errors.opciones[i]?.nombre?.message}</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-suave">+ $</span>
                        <Input aria-label={`Precio de la opción ${i + 1}`} inputMode="decimal" placeholder="sin cargo" className="numeros pl-10 text-right font-semibold" aria-invalid={Boolean(errors.opciones?.[i]?.precio)} {...register(`opciones.${i}.precio`)} />
                      </div>
                      {errors.opciones?.[i]?.precio && <p className="text-[13px] font-medium text-rojo">{errors.opciones[i]?.precio?.message}</p>}
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Quitar opción ${i + 1}`} disabled={opciones.fields.length <= 1} onClick={() => opciones.remove(i)}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" className="mt-1 self-start" disabled={opciones.fields.length >= 30} onClick={() => opciones.append({ nombre: '', precio: '' })}>
                <Plus /> Agregar opción
              </Button>
            </fieldset>
          </DialogBody>
          <DialogFooter className="justify-between">
            {grupo ? (
              <Button variant="ghost-destructive" onClick={() => alDarDeBaja(grupo)}>
                <Trash2 /> Eliminar grupo
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardar.isPending}>
                {grupo ? 'Guardar cambios' : 'Crear grupo'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
