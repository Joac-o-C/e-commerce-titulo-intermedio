interface ProgressBarProps {
  active: boolean
  className?: string
}

/**
 * Barra indeterminada para indicar que se está esperando al backend.
 * Mantiene su alto aunque esté inactiva para que el layout no salte.
 */
export function ProgressBar({ active, className = '' }: ProgressBarProps) {
  return (
    <div
      role={active ? 'progressbar' : undefined}
      aria-hidden={!active}
      className={`h-1 w-full overflow-hidden ${className}`}
    >
      {active && <div className="h-full w-2/5 animate-indeterminate bg-neutral-800 motion-reduce:animate-pulse" />}
    </div>
  )
}
