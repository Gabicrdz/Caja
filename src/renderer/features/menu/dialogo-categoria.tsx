import { useEffect, useState, type FormEvent } from 'react';
import type { Categoria } from '@compartido/tipos';
import { esquemaCategoria } from '@compartido/esquemas';
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
import { caja } from '@/lib/api';
import { useAccion } from './consultas';

interface Props {
  abierto: boolean;
  /** Si viene una categoría, se renombra; si no, se crea una nueva. */
  categoria: Categoria | null;
  alCerrar: () => void;
  alCrear?: (id: number) => void;
}

export function DialogoCategoria({ abierto, categoria, alCerrar, alCrear }: Props) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const crear = useAccion(caja().categorias.crear, { exito: 'Categoría creada', avisarError: false });
  const renombrar = useAccion(caja().categorias.renombrar, { exito: 'Categoría renombrada', avisarError: false });
  const guardando = crear.isPending || renombrar.isPending;

  useEffect(() => {
    if (abierto) {
      setNombre(categoria?.nombre ?? '');
      setError('');
    }
  }, [abierto, categoria]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    const revisado = esquemaCategoria.safeParse({ nombre });
    if (!revisado.success) {
      setError(revisado.error.issues[0]?.message ?? 'Revisá el nombre.');
      return;
    }
    try {
      if (categoria) {
        await renombrar.mutateAsync([categoria.id, revisado.data]);
      } else {
        const id = await crear.mutateAsync([revisado.data]);
        alCrear?.(id);
      }
      alCerrar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(abrir) => !abrir && alCerrar()}>
      <DialogContent className="max-w-md">
        <form onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>{categoria ? 'Renombrar categoría' : 'Nueva categoría'}</DialogTitle>
            <DialogDescription>
              Las categorías ordenan el menú en la pantalla de venta: Hamburguesas, Bebidas, Postres…
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Campo etiqueta="Nombre" htmlFor="nombre-categoria" error={error}>
              <Input
                id="nombre-categoria"
                value={nombre}
                autoFocus
                maxLength={40}
                aria-invalid={Boolean(error)}
                placeholder="Por ejemplo: Pizzas"
                onChange={(e) => {
                  setNombre(e.target.value);
                  setError('');
                }}
              />
            </Campo>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {categoria ? 'Guardar' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
