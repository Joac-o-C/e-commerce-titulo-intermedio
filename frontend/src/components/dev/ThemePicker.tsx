import { useState } from 'react'
import {
  THEMES,
  getModePreference,
  getTheme,
  setModePreference,
  setTheme,
  type ModePreference,
  type ThemeId,
} from '../../lib/theme'

const MODES: { id: ModePreference; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'system', label: 'Sistema' },
]

/**
 * Selector de tema para comparar las propuestas de la Fase 6. Sólo aparece
 * con `VITE_THEME_SELECTION=true` en el `.env`; no es parte de la tienda.
 */
export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [theme, setThemeState] = useState<ThemeId>(getTheme)
  const [mode, setModeState] = useState<ModePreference>(getModePreference)

  return (
    <div className="fixed bottom-4 left-4 z-50 text-sm">
      {open && (
        <div
          id="theme-picker"
          className="mb-2 w-72 rounded-lg border border-neutral-200 bg-white p-3 text-neutral-800 shadow-lg"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Propuesta</p>
          <div className="mt-2 space-y-1">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={theme === t.id}
                onClick={() => {
                  setTheme(t.id)
                  setThemeState(t.id)
                }}
                className={`block w-full rounded px-2 py-1.5 text-left ${
                  theme === t.id ? 'bg-neutral-100 ring-1 ring-primary' : 'hover:bg-neutral-100'
                }`}
              >
                <span className="font-medium">{t.name}</span>
                <span className="block text-xs text-neutral-500">{t.description}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Modo</p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded border border-neutral-200 p-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => {
                  setModePreference(m.id)
                  setModeState(m.id)
                }}
                className={`rounded py-1 ${mode === m.id ? 'bg-primary text-on-primary' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="theme-picker"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 shadow-md hover:bg-neutral-100"
      >
        🎨 Tema
      </button>
    </div>
  )
}
