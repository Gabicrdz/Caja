/** Logo de la caja: un ticket con el corte dentado, sobre fondo mostaza. */
export function Marca({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#f2b705" />
      <path
        d="M12 9h16v20l-2.67 2-2.66-2-2.67 2-2.67-2-2.66 2L12 29z"
        fill="#1b1c1e"
      />
      <rect x="15.5" y="14" width="9" height="2.2" rx="1.1" fill="#f2b705" />
      <rect x="15.5" y="19" width="6" height="2.2" rx="1.1" fill="#f2b705" />
    </svg>
  );
}
