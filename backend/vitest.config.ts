import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // La Fase 0 todavía no tiene lógica de negocio que testear; las fases
    // siguientes van agregando specs por servicio (ver plan-de-ejecucion.md).
    passWithNoTests: true,
  },
});
