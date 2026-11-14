import { describe, expect, it } from 'vitest';
import type { PedidoDetalle } from '../src/compartido/tipos';
import { escapar, htmlComanda, htmlTicket } from '../src/main/impresion/plantillas';

const $ = (n: number) => n * 100;
const pedido: PedidoDetalle = {
  id: 1,
  numero: 12,
  fecha: '2026-11-09',
  hora: '21:15',
  tipo: 'delivery',
  mesa: '',
  clienteNombre: 'Lucía <script>',
  clienteTelefono: '370 4556677',
  clienteDireccion: 'Belgrano 845',
  nota: 'Tocar timbre',
  subtotalCentavos: $(25300),
  envioCentavos: $(1500),
  totalCentavos: $(26800),
  estado: 'pendiente',
  cobrado: true,
  motivoAnulacion: '',
  items: [
    {
      id: 1, nombre: 'Clásica', varianteNombre: '', cantidad: 2, unitarioCentavos: $(8500), agregadosCentavos: $(900), totalCentavos: $(18800), nota: 'pan tostado', vaACocina: true,
      agregados: [
        { grupoNombre: 'Punto de la carne', nombre: 'A punto', precioCentavos: 0 },
        { grupoNombre: 'Extras', nombre: 'Cheddar', precioCentavos: $(900) },
      ],
    },
    { id: 2, nombre: 'Gaseosa', varianteNombre: '1,5 L', cantidad: 1, unitarioCentavos: $(3800), agregadosCentavos: 0, totalCentavos: $(3800), nota: '', vaACocina: false, agregados: [] },
    { id: 3, nombre: 'Flan casero', varianteNombre: '', cantidad: 1, unitarioCentavos: $(2700), agregadosCentavos: 0, totalCentavos: $(2700), nota: '', vaACocina: true, agregados: [] },
  ],
  pagos: [{ medio: 'efectivo', montoCentavos: $(26800), recibidoCentavos: $(30000), vueltoCentavos: $(3200) }],
  comprobante: null,
  notaDeCredito: null,
  facturaPendiente: null,
};

const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('impresión', () => {
  it('escapa el texto que escribió una persona', () => {
    expect(escapar(`<b>"Tom's" & co</b>`)).toBe('&lt;b&gt;&quot;Tom&#39;s&quot; &amp; co&lt;/b&gt;');
  });

  it('la comanda lleva solo lo de cocina, sin precios, con agregados y notas', () => {
    const html = htmlComanda(pedido, 80)!;
    const t = texto(html);
    expect(t).toContain('#12');
    expect(t).toContain('Delivery');
    expect(t).toContain('2 × Clásica');
    expect(t).toContain('• A punto');
    expect(t).toContain('» pan tostado');
    expect(t).toContain('1 × Flan casero');
    expect(t).toContain('Tocar timbre');
    expect(t).toContain('+ 1 producto(s) que no van a cocina');
    expect(t.includes('Gaseosa')).toBe(false);
    expect(t.includes('$')).toBe(false);
    expect(html.includes('<script>')).toBe(false);
    expect(html).toContain('size: 80mm auto');
  });

  it('sin nada para cocina no hay comanda', () => {
    expect(htmlComanda({ ...pedido, items: [pedido.items[1]!] }, 58)).toBeNull();
  });

  it('el ticket tiene precios, envío, pago y vuelto', () => {
    const t = texto(htmlTicket(pedido, 'La Esquina', 58));
    expect(t).toContain('La Esquina');
    expect(t).toContain('09/11/2026 · 21:15');
    expect(t).toContain('Pedido #12 · Delivery');
    expect(t).toContain('Belgrano 845');
    expect(t).toContain('2 × Clásica $ 18.800');
    expect(t).toContain('$ 9.400 c/u');
    expect(t).toContain('+ Cheddar $ 900');
    expect(t).toContain('Envío $ 1.500');
    expect(t).toContain('TOTAL $ 26.800');
    expect(t).toContain('Efectivo (pagó $ 30.000) $ 26.800');
    expect(t).toContain('Vuelto $ 3.200');
    expect(t).toContain('no válido como factura');
  });

  it('si falta cobrar o está anulado, lo dice en grande', () => {
    expect(texto(htmlTicket({ ...pedido, cobrado: false, pagos: [] }, 'X', 80))).toContain('A COBRAR $ 26.800');
    expect(texto(htmlTicket({ ...pedido, estado: 'anulado' }, 'X', 80))).toContain('ANULADO');
  });
});
