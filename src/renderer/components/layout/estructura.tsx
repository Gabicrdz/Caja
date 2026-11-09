import { Outlet } from 'react-router';
import { Riel } from './riel';

/** Riel a la izquierda y la sección actual a la derecha. */
export function Estructura() {
  return (
    <div className="flex h-full">
      <Riel />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
