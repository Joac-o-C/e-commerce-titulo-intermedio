import { STORE_NAME } from '../../lib/brand'

/**
 * Marca de la tienda (isotipo + nombre). El isotipo es provisorio: cuando el
 * equipo tenga el logo definitivo alcanza con reemplazar `BrandMark` (o
 * cambiarlo por un `<img src="/brand/logo.svg">`) y el favicon en `public/`.
 */
export function BrandLogo() {
  return (
    <span className="flex items-center gap-2">
      <BrandMark className="h-8 w-8 shrink-0" />
      <span className="text-lg font-semibold tracking-tight text-neutral-900">{STORE_NAME}</span>
    </span>
  )
}

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M10 13h12l-1 11H11z" fill="none" strokeWidth="2" className="stroke-on-primary" strokeLinejoin="round" />
      <path d="M13 13v-1.5a3 3 0 0 1 6 0V13" fill="none" strokeWidth="2" className="stroke-on-primary" strokeLinecap="round" />
    </svg>
  )
}
