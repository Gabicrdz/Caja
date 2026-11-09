import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface Confirmacion {
  titulo: string;
  descripcion: string;
  boton: string;
  alConfirmar: () => void;
}

/** Pregunta "¿Seguro?" antes de una acción que no se puede deshacer fácil. */
export function Confirmar({
  confirmacion,
  alCerrar,
}: {
  confirmacion: Confirmacion | null;
  alCerrar: () => void;
}) {
  return (
    <AlertDialog open={confirmacion !== null} onOpenChange={(abrir) => !abrir && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogTitle>{confirmacion?.titulo}</AlertDialogTitle>
        <AlertDialogDescription>{confirmacion?.descripcion}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction peligro onClick={() => confirmacion?.alConfirmar()}>
            {confirmacion?.boton}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
