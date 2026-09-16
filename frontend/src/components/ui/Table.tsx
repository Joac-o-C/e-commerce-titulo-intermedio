import type { ReactNode } from 'react'

export interface TableColumn<T> {
  header: string
  render: (row: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyMessage?: string
}

/** Tabla genérica reutilizada por los listados del panel admin (CU-16/17/18). */
export function Table<T>({ columns, rows, rowKey, emptyMessage = 'Sin resultados' }: TableProps<T>) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-neutral-500">
          {columns.map((col) => (
            <th key={col.header} className="px-3 py-2 font-medium">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="px-3 py-6 text-center text-neutral-500">
              {emptyMessage}
            </td>
          </tr>
        )}
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-b border-neutral-100 hover:bg-neutral-50">
            {columns.map((col) => (
              <td key={col.header} className={`px-3 py-2 ${col.className ?? ''}`}>
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
