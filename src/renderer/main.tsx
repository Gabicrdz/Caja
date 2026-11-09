// Punto de entrada de la VENTANA (proceso renderer): arma React con el router,
// TanStack Query (datos del main) y los avisos (toasts).
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Estructura } from '@/components/layout/estructura';
import { PaginaClientes } from '@/features/clientes/pagina-clientes';
import { PaginaReportes } from '@/features/reportes/pagina-reportes';
import { PaginaMenu } from '@/features/menu/pagina-menu';
import { PaginaVender } from '@/features/vender/pagina-vender';
import { PaginaPedidos } from '@/features/pedidos/pagina-pedidos';
import { PaginaCaja } from '@/features/caja/pagina-caja';
import { PaginaAjustes } from '@/features/ajustes/pagina-ajustes';
import { PantallaIngreso } from '@/features/sesion/pantalla-ingreso';
import { CLAVE_SESION, useSesion, useUsuario } from '@/features/sesion/consultas';
import type { ReactNode } from 'react';
import './index.css';

// La app instalada se abre desde un archivo (file://), por eso usamos el
// router con "#" (hash): /#/menu, /#/vender…
const router = createHashRouter([
  {
    path: '/',
    element: <Estructura />,
    children: [
      { index: true, element: <Navigate to="/vender" replace /> },
      { path: 'vender', element: <PaginaVender /> },
      { path: 'pedidos', element: <PaginaPedidos /> },
      { path: 'caja', element: <PaginaCaja /> },
      { path: 'ajustes', element: <SoloDueno><PaginaAjustes /></SoloDueno> },
      { path: 'menu', element: <PaginaMenu /> },
      { path: 'clientes', element: <PaginaClientes /> },
      { path: 'reportes', element: <SoloDueno><PaginaReportes /></SoloDueno> },
      { path: '*', element: <Navigate to="/vender" replace /> },
    ],
  },
]);

/** Si un cajero llega a una sección del dueño, vuelve a Vender. */
function SoloDueno({ children }: { children: ReactNode }) {
  const { esDueno } = useUsuario();
  return esDueno ? children : <Navigate to="/vender" replace />;
}

/** Sin sesión se ve la pantalla de ingreso; con sesión, el sistema. */
function Raiz() {
  const sesion = useSesion();
  const cliente = useQueryClient();
  useEffect(() => {
    const revisar = () => void cliente.invalidateQueries({ queryKey: CLAVE_SESION });
    window.addEventListener('sesion-cerrada', revisar);
    return () => window.removeEventListener('sesion-cerrada', revisar);
  }, [cliente]);
  if (sesion.isPending) return null;
  if (!sesion.data) return <PantallaIngreso />;
  return <RouterProvider router={router} />;
}

const consultas = new QueryClient({
  defaultOptions: {
    // Los datos vienen de la base local: no hace falta reintentar ni
    // volver a pedirlos cada vez que la ventana toma el foco.
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <TooltipProvider delayDuration={300}>
        <Raiz />
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: '!rounded-lg !border-0 !bg-tinta !text-white !font-sans !text-[15px] !shadow-xl',
              description: '!text-white/70',
              error: '!bg-rojo',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
