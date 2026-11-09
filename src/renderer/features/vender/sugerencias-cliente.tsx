// Mientras se escribe el teléfono (o el nombre) de un delivery, sugiere
// clientes que ya pidieron. Al tocar uno, completa nombre, teléfono y
// dirección: el cajero no tiene que volver a preguntar todo.
import { useEffect, useState } from 'react';
import { History, MapPin } from 'lucide-react';
import { claveTelefono } from '@compartido/esquemas';
import type { Cliente } from '@compartido/tipos';
import { useBuscarClientes } from '@/features/clientes/consultas';
import { useCarrito } from './carrito';

function useDemorado(valor: string, ms = 200) {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = window.setTimeout(() => setDemorado(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}

const textoPedidos = (n: number) => (n === 1 ? '1 pedido' : `${n} pedidos`);

export function SugerenciasCliente() {
  const c = useCarrito();
  const numeros = claveTelefono(c.clienteTelefono);
  const texto = useDemorado(numeros.length >= 3 ? c.clienteTelefono : c.clienteNombre);
  const busqueda = useBuscarClientes(texto);
  const resultados = (texto.trim().length >= 2 ? busqueda.data : undefined) ?? [];

  // Si los datos ya son los de un cliente, en vez de sugerir mostramos quién es.
  const elegido = resultados.find((r) => numeros.length >= 6 && claveTelefono(r.telefono) === numeros);
  if (elegido && elegido.direccion === c.clienteDireccion.trim()) {
    return (
      <p className="col-span-2 flex items-center gap-2 rounded-lg bg-mostaza-suave px-3 py-2 text-[13px]">
        <History className="size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong>Ya pidió antes</strong> · {textoPedidos(elegido.pedidos)}
          {elegido.nota && <> · {elegido.nota}</>}
        </span>
      </p>
    );
  }
  if (!resultados.length) return null;

  const elegir = (r: Cliente) =>
    c.cambiarDatos({
      clienteTelefono: r.telefono,
      clienteNombre: r.nombre || c.clienteNombre,
      clienteDireccion: r.direccion || c.clienteDireccion,
    });

  return (
    <div className="col-span-2 overflow-hidden rounded-lg border border-linea bg-superficie" role="group" aria-label="Clientes que coinciden">
      <p className="border-b border-linea bg-[#f6f6f3] px-3 py-1.5 text-[12px] font-semibold text-tinta-suave">¿Es alguno de estos? Tocalo para completar</p>
      <ul>
        {resultados.slice(0, 3).map((r) => (
          <li key={r.id} className="border-b border-linea last:border-0">
            <button
              type="button"
              onClick={() => elegir(r)}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <span className="flex w-full items-baseline gap-2 text-[14px]">
                <span className="truncate font-semibold">{r.nombre || 'Sin nombre'}</span>
                <span className="numeros text-tinta-suave">{r.telefono}</span>
                <span className="ml-auto shrink-0 text-[12px] text-tinta-suave">{textoPedidos(r.pedidos)}</span>
              </span>
              {r.direccion && (
                <span className="flex items-center gap-1 truncate text-[13px] text-tinta-suave">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {r.direccion}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
