// Punto de entrada de la VENTANA (proceso renderer): arma React con el router,
// TanStack Query (datos del main) y los avisos (toasts).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Estructura } from '@/components/layout/estructura';
import { PaginaMenu } from '@/features/menu/pagina-menu';
import './index.css';

// La app instalada se abre desde un archivo (file://), por eso usamos el
// router con "#" (hash): /#/menu, /#/vender…
const router = createHashRouter([
  {
    path: '/',
    element: <Estructura />,
    children: [
      { index: true, element: <Navigate to="/menu" replace /> },
      { path: 'menu', element: <PaginaMenu /> },
      { path: '*', element: <Navigate to="/menu" replace /> },
    ],
  },
]);

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
        <RouterProvider router={router} />
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
