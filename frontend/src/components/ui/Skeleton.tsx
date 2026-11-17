/** Bloque gris animado que ocupa el lugar del contenido mientras carga. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-neutral-200 ${className}`} />
}
