import { useEffect, useState, type ComponentProps } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleAlert, Plus, X } from 'lucide-react';
import type { Categoria, GrupoAgregados, Producto } from '@compartido/tipos';
import { PRECIO_MAXIMO, type DatosProducto } from '@compartido/esquemas';
import { leerPesos, pesosParaCampo } from '@compartido/dinero';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { caja } from '@/lib/api';
import { useAccion } from './consultas';
import { reglaDelGrupo } from './textos';

// El formulario trabaja con TEXTOS (lo que se escribe en los campos);
// recién al guardar los precios pasan a centavos.
const precioEscrito = z
  .string()
  .refine((t) => leerPesos(t) !== null, 'Escribí un precio (ej.: 8.500).')
  .refine((t) => (leerPesos(t) ?? 0) <= PRECIO_MAXIMO, 'El precio es demasiado grande.');

const esquemaFormulario = z
  .object({
    nombre: z.string().trim().min(1, 'Escribí el nombre del producto.').max(60, 'Máximo 60 caracteres.'),
    codigo: z
      .string()
      .trim()
      .max(10, 'Hasta 10 caracteres.')
      .regex(/^[\p{L}\d-]*$/u, 'Solo letras, números o guiones.'),
    categoriaId: z.string().min(1, 'Elegí una categoría.'),
    descripcion: z.string().trim().max(140, 'Máximo 140 caracteres.'),
    conTamanos: z.boolean(),
    precio: z.string(),
    variantes: z.array(
      z.object({
        id: z.number().optional(),
        nombre: z.string().trim().min(1, 'Falta el nombre.').max(30, 'Máximo 30 caracteres.'),
        precio: precioEscrito,
      }),
    ),
    gruposIds: z.array(z.number()),
    disponible: z.boolean(),
    vaACocina: z.boolean(),
  })
  .superRefine((f, ctx) => {
    if (!f.conTamanos) {
      const r = precioEscrito.safeParse(f.precio);
      if (!r.success) ctx.addIssue({ code: 'custom', path: ['precio'], message: r.error.issues[0]!.message });
      return;
    }
    if (f.variantes.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['variantes'], message: 'Con tamaños hacen falta al menos dos (por ejemplo Chica y Grande).' });
    }
    const vistos = new Set<string>();
    f.variantes.forEach((v, i) => {
      const clave = v.nombre.trim().toLocaleLowerCase('es');
      if (clave && vistos.has(clave)) {
        ctx.addIssue({ code: 'custom', path: ['variantes', i, 'nombre'], message: 'Repetido.' });
      }
      vistos.add(clave);
    });
  });

type Formulario = z.infer<typeof esquemaFormulario>;

function valoresIniciales(producto: Producto | null, categoriaId: number | null): Formulario {
  return {
    nombre: producto?.nombre ?? '',
    codigo: producto?.codigo ?? '',
    categoriaId: String(producto?.categoriaId ?? categoriaId ?? ''),
    descripcion: producto?.descripcion ?? '',
    conTamanos: (producto?.variantes.length ?? 0) > 0,
    precio: producto && producto.variantes.length === 0 ? pesosParaCampo(producto.precioCentavos) : '',
    variantes: producto?.variantes.length
      ? producto.variantes.map((v) => ({ id: v.id, nombre: v.nombre, precio: pesosParaCampo(v.precioCentavos) }))
      : [
          { nombre: '', precio: '' },
          { nombre: '', precio: '' },
        ],
    gruposIds: producto?.gruposIds ?? [],
    disponible: producto?.disponible ?? true,
    vaACocina: producto?.vaACocina ?? true,
  };
}

function aDatos(f: Formulario, id: number | undefined): DatosProducto {
  return {
    id,
    categoriaId: Number(f.categoriaId),
    nombre: f.nombre,
    codigo: f.codigo,
    descripcion: f.descripcion,
    precioCentavos: f.conTamanos ? 0 : leerPesos(f.precio)!,
    variantes: f.conTamanos
      ? f.variantes.map((v) => ({ id: v.id, nombre: v.nombre, precioCentavos: leerPesos(v.precio)! }))
      : [],
    gruposIds: f.gruposIds,
    disponible: f.disponible,
    vaACocina: f.vaACocina,
  };
}

interface Props {
  abierto: boolean;
  producto: Producto | null;
  categoriaInicial: number | null;
  categorias: Categoria[];
  grupos: GrupoAgregados[];
  alCerrar: () => void;
  alIrAAgregados: () => void;
}

export function EditorProducto({
  abierto,
  producto,
  categoriaInicial,
  categorias,
  grupos,
  alCerrar,
  alIrAAgregados,
}: Props) {
  const [errorServidor, setErrorServidor] = useState('');
  const guardar = useAccion(caja().productos.guardar, {
    exito: producto ? 'Cambios guardados' : 'Producto agregado al menú',
    avisarError: false,
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Formulario>({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: valoresIniciales(producto, categoriaInicial),
  });
  const variantes = useFieldArray({ control, name: 'variantes' });
  const conTamanos = watch('conTamanos');

  useEffect(() => {
    if (abierto) {
      reset(valoresIniciales(producto, categoriaInicial));
      setErrorServidor('');
    }
  }, [abierto, producto, categoriaInicial, reset]);

  const enviar = handleSubmit(async (f) => {
    setErrorServidor('');
    try {
      await guardar.mutateAsync([aDatos(f, producto?.id)]);
      alCerrar();
    } catch (e) {
      setErrorServidor((e as Error).message);
    }
  });

  return (
    <Dialog open={abierto} onOpenChange={(abrir) => !abrir && alCerrar()}>
      <DialogContent className="max-w-[780px]">
        <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{producto ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
            <DialogDescription>
              {producto ? producto.nombre : 'Lo que cargues acá aparece en la pantalla de venta.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-7">
            {errorServidor && (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-rojo-suave px-4 py-3 text-[15px] font-medium text-rojo">
                <CircleAlert className="mt-0.5 size-[18px] shrink-0" />
                {errorServidor}
              </div>
            )}

            <div className="grid grid-cols-[1fr_150px] gap-4">
              <Campo etiqueta="Nombre" htmlFor="p-nombre" error={errors.nombre?.message}>
                <Input id="p-nombre" autoFocus maxLength={60} aria-invalid={Boolean(errors.nombre)} placeholder="Por ejemplo: Lomito completo" {...register('nombre')} />
              </Campo>
              <Campo etiqueta="Código rápido" htmlFor="p-codigo" error={errors.codigo?.message} ayuda="Opcional">
                <Input id="p-codigo" maxLength={10} className="uppercase" placeholder="L1" aria-invalid={Boolean(errors.codigo)} {...register('codigo')} />
              </Campo>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Categoría" error={errors.categoriaId?.message}>
                <Controller
                  control={control}
                  name="categoriaId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Categoría" aria-invalid={Boolean(errors.categoriaId)}>
                        <SelectValue placeholder="Elegí una categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {categorias.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nombre}
                            {!c.activa && ' (oculta)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Campo>
              <Campo etiqueta="Descripción" htmlFor="p-descripcion" error={errors.descripcion?.message} ayuda="Opcional. Se ve al vender.">
                <Textarea id="p-descripcion" rows={1} maxLength={140} className="min-h-11 py-2.5" placeholder="Lo que lleva" {...register('descripcion')} />
              </Campo>
            </div>

            {/* ── Precio ── */}
            <fieldset className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-semibold">Precio</legend>
                <div role="radiogroup" aria-label="Tipo de precio" className="inline-flex rounded-lg bg-secondary p-1">
                  {[
                    { valor: false, texto: 'Precio único' },
                    { valor: true, texto: 'Por tamaño' },
                  ].map((op) => (
                    <button
                      key={op.texto}
                      type="button"
                      role="radio"
                      aria-checked={conTamanos === op.valor}
                      onClick={() => setValue('conTamanos', op.valor, { shouldValidate: false })}
                      className={cn(
                        'h-9 rounded-md px-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                        conTamanos === op.valor ? 'bg-superficie shadow-sm' : 'text-tinta-suave hover:text-tinta',
                      )}
                    >
                      {op.texto}
                    </button>
                  ))}
                </div>
              </div>

              {!conTamanos ? (
                <Campo etiqueta={<span className="sr-only">Precio</span>} htmlFor="p-precio" error={errors.precio?.message} className="max-w-[220px]">
                  <PrecioInput id="p-precio" invalido={Boolean(errors.precio)} {...register('precio')} />
                </Campo>
              ) : (
                <div className="flex flex-col gap-2">
                  <ul className="flex flex-col gap-2">
                    {variantes.fields.map((campo, i) => (
                      <li key={campo.id} className="grid grid-cols-[1fr_200px_44px] items-start gap-2">
                        <div className="flex flex-col gap-1">
                          <Input
                            aria-label={`Nombre del tamaño ${i + 1}`}
                            placeholder={['Chica', 'Grande', 'Familiar'][i] ?? 'Tamaño'}
                            maxLength={30}
                            aria-invalid={Boolean(errors.variantes?.[i]?.nombre)}
                            {...register(`variantes.${i}.nombre`)}
                          />
                          {errors.variantes?.[i]?.nombre && (
                            <p className="text-[13px] font-medium text-rojo">{errors.variantes[i]?.nombre?.message}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <PrecioInput
                            aria-label={`Precio del tamaño ${i + 1}`}
                            invalido={Boolean(errors.variantes?.[i]?.precio)}
                            {...register(`variantes.${i}.precio`)}
                          />
                          {errors.variantes?.[i]?.precio && (
                            <p className="text-[13px] font-medium text-rojo">{errors.variantes[i]?.precio?.message}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar tamaño ${i + 1}`}
                          disabled={variantes.fields.length <= 2}
                          onClick={() => variantes.remove(i)}
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {errors.variantes?.root?.message || errors.variantes?.message ? (
                    <p role="alert" className="text-[13px] font-medium text-rojo">
                      {errors.variantes?.root?.message ?? errors.variantes?.message}
                    </p>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={variantes.fields.length >= 12}
                    onClick={() => variantes.append({ nombre: '', precio: '' })}
                  >
                    <Plus /> Agregar tamaño
                  </Button>
                </div>
              )}
            </fieldset>

            {/* ── Agregados ── */}
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold">Agregados que se pueden elegir</legend>
              {grupos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-linea-fuerte px-4 py-3 text-sm text-tinta-suave">
                  Todavía no hay grupos de agregados (extras, punto de la carne, guarniciones…).{' '}
                  <button type="button" className="font-semibold text-tinta underline underline-offset-2" onClick={alIrAAgregados}>
                    Crear uno en la pestaña Agregados
                  </button>
                </p>
              ) : (
                <Controller
                  control={control}
                  name="gruposIds"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2">
                      {grupos.map((g) => {
                        const marcado = field.value.includes(g.id);
                        return (
                          <label
                            key={g.id}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors',
                              marcado ? 'border-tinta bg-[#fafaf8]' : 'border-linea hover:border-linea-fuerte',
                            )}
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={marcado}
                              onCheckedChange={(v) =>
                                field.onChange(v ? [...field.value, g.id] : field.value.filter((id) => id !== g.id))
                              }
                            />
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="font-semibold">{g.nombre}</span>
                              <span className="truncate text-[13px] text-tinta-suave">
                                {reglaDelGrupo(g)} · {g.opciones.map((o) => o.nombre).join(', ')}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
              )}
            </fieldset>

            {/* ── Opciones ── */}
            <div className="grid grid-cols-2 gap-2">
              <Controller
                control={control}
                name="disponible"
                render={({ field }) => (
                  <Interruptor
                    titulo="Disponible para vender"
                    detalle="Apagalo cuando se termina (queda como agotado)."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="vaACocina"
                render={({ field }) => (
                  <Interruptor
                    titulo="Se prepara en cocina"
                    detalle="Sale en la comanda. Apagalo para bebidas envasadas."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {producto ? 'Guardar cambios' : 'Agregar al menú'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PrecioInput({ invalido, className, ...props }: ComponentProps<'input'> & { invalido?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-suave">$</span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        aria-invalid={invalido}
        className={cn('numeros pl-7 text-right font-display text-base font-semibold', className)}
        {...props}
      />
    </div>
  );
}

function Interruptor({
  titulo,
  detalle,
  checked,
  onChange,
}: {
  titulo: string;
  detalle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-linea px-4 py-3">
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{titulo}</span>
        <span className="text-[13px] text-tinta-suave">{detalle}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
