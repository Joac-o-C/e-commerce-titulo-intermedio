import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warning'

/** Link opcional dentro del aviso (p. ej. "Ver carrito"). */
export interface ToastAction {
  label: string
  to: string
}

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, tone?: ToastTone, action?: ToastAction) => void
  dismiss: (id: number) => void
}

const TOAST_DURATION_MS = 4000
// Los avisos de advertencia (p. ej. cuenta bloqueada) se leen con más calma.
const WARNING_DURATION_MS = 8000
let nextId = 0

/** Avisos temporales globales; los renderiza `Toaster` (dentro de `Layout`). */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, tone = 'info', action) => {
    const id = ++nextId
    set({ toasts: [...get().toasts, { id, message, tone, action }] })
    setTimeout(() => get().dismiss(id), tone === 'warning' ? WARNING_DURATION_MS : TOAST_DURATION_MS)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
