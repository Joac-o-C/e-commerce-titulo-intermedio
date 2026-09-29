interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

/** Anterior / siguiente de los listados paginados del panel admin (CU-19, CU-22). */
export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <nav className="flex items-center justify-between text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
      >
        Anterior
      </button>
      <span className="text-neutral-600">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
      >
        Siguiente
      </button>
    </nav>
  )
}
