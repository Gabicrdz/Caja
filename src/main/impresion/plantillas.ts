// Arma el HTML de la COMANDA (para la cocina) y del TICKET (para el cliente).
// Son funciones puras: reciben el pedido y devuelven texto. Así se pueden
// probar sin impresora y sin abrir Electron.
import { pesos } from '@compartido/dinero';
import {
  MEDIOS_DE_PAGO,
  NOMBRE_MEDIO,
  NOMBRE_MOVIMIENTO,
  NOMBRE_TIPO,
  type PedidoDetalle,
  type ResumenCaja,
} from '@compartido/tipos';

/** Todo texto que escribió una persona pasa por acá antes de ir al HTML. */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}

function destino(p: PedidoDetalle): string {
  if (p.tipo === 'mesa') return `Mesa ${escapar(p.mesa)}`;
  return NOMBRE_TIPO[p.tipo];
}

/** Estilos pensados para papel térmico: negro sobre blanco, letra grande y clara. */
function estilos(anchoMm: 58 | 80): string {
  const imprimible = anchoMm === 80 ? 72 : 48; // lo que de verdad imprime la cabeza térmica
  return `
    @page { size: ${anchoMm}mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: #000; }
    body { width: ${anchoMm}mm; padding: 3mm ${(anchoMm - imprimible) / 2}mm 6mm;
           font: ${anchoMm === 80 ? 12 : 10.5}px/1.35 Arial, Helvetica, sans-serif; }
    .centro { text-align: center; }
    .grande { font-size: 1.6em; font-weight: 700; }
    .enorme { font-size: 3em; font-weight: 800; line-height: 1; }
    .negrita { font-weight: 700; }
    .chico { font-size: .88em; }
    .linea { border-top: 1px dashed #000; margin: 2.2mm 0; }
    .fila { display: flex; justify-content: space-between; gap: 2mm; }
    .fila > :last-child { white-space: nowrap; }
    .item { margin-bottom: 1.6mm; }
    .sub { padding-left: 4mm; }
    .nota { padding-left: 4mm; font-style: italic; font-weight: 700; }
    .caja { border: 2px solid #000; padding: 1.2mm 2mm; margin: 1.5mm 0; }
  `;
}

function documento(titulo: string, cuerpo: string, anchoMm: 58 | 80): string {
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>${estilos(anchoMm)}</style></head><body>${cuerpo}</body></html>`;
}

/** Comanda: lo que tiene que preparar la cocina. Sin precios. */
export function htmlComanda(p: PedidoDetalle, anchoMm: 58 | 80): string | null {
  const items = p.items.filter((i) => i.vaACocina);
  if (items.length === 0) return null;
  const cuerpo = `
    <div class="centro negrita">COMANDA</div>
    <div class="centro enorme">#${p.numero}</div>
    <div class="centro grande">${destino(p)}</div>
    <div class="centro">${fechaCorta(p.fecha)} · ${p.hora}${p.clienteNombre ? ` · ${escapar(p.clienteNombre)}` : ''}</div>
    <div class="linea"></div>
    ${items
      .map(
        (i) => `
      <div class="item">
        <div class="grande">${i.cantidad} × ${escapar(i.nombre)}${i.varianteNombre ? ` (${escapar(i.varianteNombre)})` : ''}</div>
        ${i.agregados.map((a) => `<div class="sub">• ${escapar(a.nombre)}</div>`).join('')}
        ${i.nota ? `<div class="nota">» ${escapar(i.nota)}</div>` : ''}
      </div>`,
      )
      .join('')}
    ${p.nota ? `<div class="linea"></div><div class="caja negrita">${escapar(p.nota)}</div>` : ''}
    ${p.items.length > items.length ? `<div class="linea"></div><div class="chico">+ ${p.items.length - items.length} producto(s) que no van a cocina</div>` : ''}
  `;
  return documento(`Comanda #${p.numero}`, cuerpo, anchoMm);
}

/** Lo que va arriba del ticket. Se puede pasar solo el nombre (pruebas viejas). */
export interface DatosDelLocal {
  nombre: string;
  direccion?: string;
  telefono?: string;
  pie?: string;
}
type Local = string | DatosDelLocal;
const comoLocal = (l: Local): DatosDelLocal => (typeof l === 'string' ? { nombre: l, pie: '¡Gracias!' } : l);

function encabezado(local: Local): string {
  const l = comoLocal(local);
  return `
    <div class="centro grande">${escapar(l.nombre)}</div>
    ${l.direccion ? `<div class="centro chico">${escapar(l.direccion)}</div>` : ''}
    ${l.telefono ? `<div class="centro chico">Tel. ${escapar(l.telefono)}</div>` : ''}`;
}

/** Ticket para el cliente: con precios, pagos y vuelto. No es factura. */
export function htmlTicket(p: PedidoDetalle, local: Local, anchoMm: 58 | 80): string {
  const vuelto = p.pagos.reduce((s, x) => s + x.vueltoCentavos, 0);
  const pie = comoLocal(local).pie;
  const cuerpo = `
    ${encabezado(local)}
    <div class="centro">${fechaCorta(p.fecha)} · ${p.hora}</div>
    <div class="centro negrita">Pedido #${p.numero} · ${destino(p)}</div>
    ${p.clienteNombre ? `<div class="centro">${escapar(p.clienteNombre)}${p.clienteTelefono ? ` · ${escapar(p.clienteTelefono)}` : ''}</div>` : ''}
    ${p.tipo === 'delivery' && p.clienteDireccion ? `<div class="centro negrita">${escapar(p.clienteDireccion)}</div>` : ''}
    <div class="linea"></div>
    ${p.items
      .map(
        (i) => `
      <div class="item">
        <div class="fila"><span>${i.cantidad} × ${escapar(i.nombre)}${i.varianteNombre ? ` ${escapar(i.varianteNombre)}` : ''}</span><span>${pesos(i.totalCentavos)}</span></div>
        ${i.cantidad > 1 ? `<div class="sub chico">${pesos(i.unitarioCentavos + i.agregadosCentavos)} c/u</div>` : ''}
        ${i.agregados
          .map((a) => `<div class="sub chico">+ ${escapar(a.nombre)}${a.precioCentavos ? ` ${pesos(a.precioCentavos)}` : ''}</div>`)
          .join('')}
      </div>`,
      )
      .join('')}
    <div class="linea"></div>
    ${p.envioCentavos > 0 ? `<div class="fila"><span>Subtotal</span><span>${pesos(p.subtotalCentavos)}</span></div><div class="fila"><span>Envío</span><span>${pesos(p.envioCentavos)}</span></div>` : ''}
    <div class="fila grande"><span>TOTAL</span><span>${pesos(p.totalCentavos)}</span></div>
    ${
      p.estado === 'anulado'
        ? `<div class="caja centro negrita">ANULADO</div>`
        : p.cobrado
          ? `${p.pagos
              .map(
                (x) =>
                  `<div class="fila"><span>${NOMBRE_MEDIO[x.medio]}${x.vueltoCentavos ? ` (pagó ${pesos(x.recibidoCentavos)})` : ''}</span><span>${pesos(x.montoCentavos)}</span></div>`,
              )
              .join('')}${vuelto ? `<div class="fila negrita"><span>Vuelto</span><span>${pesos(vuelto)}</span></div>` : ''}`
          : `<div class="caja centro negrita">A COBRAR ${pesos(p.totalCentavos)}</div>`
    }
    <div class="linea"></div>
    <div class="centro chico">Comprobante no válido como factura</div>
    ${pie ? `<div class="centro negrita">${escapar(pie)}</div>` : ''}
  `;
  return documento(`Ticket #${p.numero}`, cuerpo, anchoMm);
}

export function htmlImpresion(tipo: 'comanda' | 'ticket', p: PedidoDetalle, local: Local, anchoMm: 58 | 80): string | null {
  return tipo === 'comanda' ? htmlComanda(p, anchoMm) : htmlTicket(p, local, anchoMm);
}

function fechaHora(momento: string): string {
  return `${fechaCorta(momento.slice(0, 10))} ${momento.slice(11, 16)}`;
}

/** Cierre de caja (arqueo) para guardar junto con la plata contada. */
export function htmlCierre(r: ResumenCaja, local: Local, anchoMm: 58 | 80): string {
  const c = r.caja;
  const fila = (a: string, b: string, clase = '') => `<div class="fila ${clase}"><span>${a}</span><span>${b}</span></div>`;
  const diferencia = c.diferenciaCentavos ?? 0;
  const cuerpo = `
    ${encabezado(local)}
    <div class="centro negrita">CIERRE DE CAJA</div>
    <div class="linea"></div>
    ${fila('Apertura', `${fechaHora(c.abiertaEn)} · ${escapar(c.abiertaPor)}`)}
    ${c.cerradaEn ? fila('Cierre', `${fechaHora(c.cerradaEn)} · ${escapar(c.cerradaPor ?? '')}`) : fila('Cierre', 'caja abierta')}
    <div class="linea"></div>
    <div class="negrita">Cobros por medio</div>
    ${MEDIOS_DE_PAGO.filter((m) => r.porMedio[m].cobros > 0)
      .map((m) => fila(`${NOMBRE_MEDIO[m]} (${r.porMedio[m].cobros})`, pesos(r.porMedio[m].montoCentavos)))
      .join('')}
    ${fila('Total cobrado', pesos(r.ventasCentavos), 'negrita')}
    ${fila('Pedidos cobrados', String(r.pedidosCobrados))}
    ${r.pedidosAnulados ? fila('Pedidos anulados', String(r.pedidosAnulados)) : ''}
    ${r.sinCobrar.cantidad ? fila(`Sin cobrar (${r.sinCobrar.cantidad})`, pesos(r.sinCobrar.totalCentavos)) : ''}
    <div class="linea"></div>
    <div class="negrita">Efectivo</div>
    ${fila('Fondo inicial', pesos(c.fondoCentavos))}
    ${fila('+ Cobrado en efectivo', pesos(r.porMedio.efectivo.montoCentavos))}
    ${r.ingresosCentavos ? fila('+ Ingresos', pesos(r.ingresosCentavos)) : ''}
    ${r.retirosCentavos ? fila('− Retiros', pesos(r.retirosCentavos)) : ''}
    ${r.gastosCentavos ? fila('− Gastos', pesos(r.gastosCentavos)) : ''}
    ${fila('Efectivo esperado', pesos(c.esperadoCentavos ?? r.efectivoEsperadoCentavos), 'negrita')}
    ${c.contadoCentavos !== null ? fila('Contado', pesos(c.contadoCentavos), 'negrita') : ''}
    ${
      c.contadoCentavos !== null
        ? `<div class="caja centro grande">${diferencia === 0 ? 'Sin diferencia' : `${diferencia > 0 ? 'Sobrante' : 'Faltante'} ${pesos(Math.abs(diferencia))}`}</div>`
        : ''
    }
    ${
      r.movimientos.length
        ? `<div class="linea"></div><div class="negrita">Movimientos</div>${r.movimientos
            .map((m) => fila(`${m.hora} ${NOMBRE_MOVIMIENTO[m.tipo]}: ${escapar(m.motivo)}`, pesos(m.montoCentavos), 'chico'))
            .join('')}`
        : ''
    }
    ${c.nota ? `<div class="linea"></div><div>Nota: ${escapar(c.nota)}</div>` : ''}
    <div class="linea"></div>
    <div class="centro chico">Firma: ______________________</div>
  `;
  return documento(`Cierre de caja ${c.id}`, cuerpo, anchoMm);
}
