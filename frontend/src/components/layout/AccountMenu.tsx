import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLogout } from '../../features/auth/useLogout'

const ITEM_CLASSES = 'block w-full px-4 py-2 text-left text-neutral-700 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none'

/** Menú "Mi cuenta" del header: direcciones (CU-12) y cerrar sesión (CU-10). */
export function AccountMenu() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const logout = useLogout()

  // Se cierra con click afuera o con Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-neutral-600 hover:text-neutral-900"
      >
        Mi cuenta
        <span aria-hidden="true" className={`text-xs transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        >
          <Link role="menuitem" to="/account/addresses" onClick={() => setOpen(false)} className={ITEM_CLASSES}>
            Direcciones
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className={ITEM_CLASSES}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
