/**
 * Tema visual (Fase 6). Mientras el equipo elige, hay 4 propuestas que se
 * prueban con el selector de tema (`VITE_THEME_SELECTION=true` en el `.env`);
 * el modo oscuro sigue la preferencia del sistema salvo que se fuerce desde
 * ese selector.
 *
 * Cuando se decida, alcanza con cambiar `DEFAULT_THEME` (y, si se quiere,
 * borrar los temas descartados de `styles/index.css`).
 */
export const THEMES = [
  { id: 'clasico', name: 'Clásico', description: 'Grises neutros, negro, fuente del sistema' },
  { id: 'terracota', name: 'Terracota', description: 'Grises cálidos, naranja tostado, DM Sans' },
  { id: 'indigo', name: 'Índigo', description: 'Grises fríos, índigo, Inter, más redondeado' },
  { id: 'bosque', name: 'Bosque', description: 'Grises zinc, verde esmeralda, Nunito, bordes suaves' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type ModePreference = 'system' | 'light' | 'dark'

export const DEFAULT_THEME: ThemeId = 'clasico'

const THEME_KEY = 'ui-theme'
const MODE_KEY = 'ui-mode'
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento (modo privado): el cambio vale sólo para esta visita.
  }
}

export function getTheme(): ThemeId {
  const stored = read(THEME_KEY)
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : DEFAULT_THEME
}

export function getModePreference(): ModePreference {
  const stored = read(MODE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

function applyMode(preference: ModePreference) {
  const dark = preference === 'dark' || (preference === 'system' && darkQuery().matches)
  document.documentElement.dataset.mode = dark ? 'dark' : 'light'
}

export function setTheme(theme: ThemeId) {
  write(THEME_KEY, theme)
  document.documentElement.dataset.theme = theme
}

export function setModePreference(preference: ModePreference) {
  write(MODE_KEY, preference)
  applyMode(preference)
}

/**
 * Aplica tema y modo antes del primer render y sigue los cambios del sistema.
 * `?theme=indigo&mode=dark` en la URL fija una propuesta (útil para pasarse links).
 */
export function initTheme() {
  const params = new URLSearchParams(window.location.search)
  const themeParam = params.get('theme')
  const modeParam = params.get('mode')
  if (THEMES.some((t) => t.id === themeParam)) write(THEME_KEY, themeParam as ThemeId)
  if (modeParam === 'light' || modeParam === 'dark' || modeParam === 'system') write(MODE_KEY, modeParam)

  document.documentElement.dataset.theme = getTheme()
  applyMode(getModePreference())
  darkQuery().addEventListener('change', () => applyMode(getModePreference()))
}
