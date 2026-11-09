import { FileText, Printer } from 'lucide-react';
import type { TipoImpresion } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { useImprimir } from './consultas';

/** "Comanda: [Imprimir] [PDF]" o "Ticket: [Imprimir] [PDF]". */
export function BotonesImpresion({
  pedidoId,
  tipo,
  deshabilitado = false,
}: {
  pedidoId: number;
  tipo: TipoImpresion;
  deshabilitado?: boolean;
}) {
  const { imprimir, pdf, ocupado } = useImprimir();
  const nombre = tipo === 'comanda' ? 'Comanda' : 'Ticket';
  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-sm font-semibold text-tinta-suave">{nombre}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={deshabilitado || ocupado}
        onClick={() => imprimir.mutate({ id: pedidoId, tipo })}
        aria-label={`Imprimir ${nombre.toLowerCase()}`}
      >
        <Printer /> Imprimir
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={deshabilitado || ocupado}
        onClick={() => pdf.mutate({ id: pedidoId, tipo })}
        aria-label={`Guardar ${nombre.toLowerCase()} en PDF`}
      >
        <FileText /> PDF
      </Button>
    </div>
  );
}
