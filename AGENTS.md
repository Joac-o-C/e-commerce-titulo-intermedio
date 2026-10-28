# Instrucciones para trabajar en este repositorio

## Alcance y contexto

- Este archivo aplica a todo el repositorio: `frontend/`, `backend/` y configuración compartida. Leerlo antes de modificar código. Si aparecen instrucciones adicionales en subdirectorios, respetarlas dentro de su alcance.
- Es un e-commerce académico para el título intermedio de Ingeniería en Sistemas. Incluye catálogo, variantes y stock, carrito, autenticación, checkout, pagos, pedidos, devoluciones y administración.
- El objetivo visual es una tienda atractiva, clara y monocromática, orientada al cliente y fácil de usar.
- Comunicarse con el usuario en español. Mantener los nombres y convenciones del código existente.
- Consultar los archivos reales antes de trabajar: el README describe la estructura general, pero los manifiestos, configuraciones y código determinan el estado actual.

## Tecnologías del proyecto

Las versiones mayores siguientes describen los manifiestos al crear este archivo. Para versiones exactas y dependencias transitivas consultar el `package.json` y `package-lock.json` de cada aplicación; actualizar este contexto cuando cambie el stack.

### Base compartida

- **TypeScript 6** como lenguaje de frontend y backend; usar `.ts` y `.tsx` según corresponda.
- **Node.js y npm**, con Node.js 24 en CI. Cada aplicación tiene sus propios scripts y lockfile; ejecutar npm desde la carpeta correspondiente.
- **ES Modules** (`type: module`) en ambas aplicaciones. Respetar la resolución de módulos de cada `tsconfig`; el backend utiliza NodeNext e imports locales con extensión `.js`.
- **Git y GitHub Actions** para control de versiones e integración continua, definida en `.github/workflows/ci.yml`.

### Frontend (`frontend/`)

- **React 19 y React DOM**, componentes funcionales y hooks; **Vite 8** con el plugin de React para desarrollo y build.
- **React Router DOM 7** para rutas.
- **Tailwind CSS 4**, integrado mediante `@tailwindcss/vite`; entrada de estilos en `src/styles/index.css`.
- **TanStack React Query 5** para consultas, caché y sincronización con el backend.
- **Zustand 5** para estado compartido del cliente, actualmente autenticación y carrito.
- **Axios** para HTTP; cliente compartido en `src/services/api-client.ts`.
- **React Hook Form**, **Zod 4** y **@hookform/resolvers** para formularios y validación.
- **Vitest 5**, **Testing Library** (React, jest-dom y user-event) y **jsdom** para pruebas.
- **Oxlint** para lint; TypeScript se compila y verifica mediante el script de build.

### Backend (`backend/`)

- **NestJS 12** sobre **Express**, con módulos, controladores, servicios e inyección de dependencias.
- **TypeORM**, driver **pg** y **PostgreSQL 16**; entidades, migraciones y seed propios.
- **@nestjs/config**, **Joi** y **dotenv** para configuración y variables de entorno.
- **class-validator**, **class-transformer** y **@nestjs/mapped-types** para DTOs y validación.
- **Passport**, **passport-jwt**, **@nestjs/jwt**, **bcrypt** y **cookie-parser** para autenticación, tokens, contraseñas y cookies.
- **SDK de Mercado Pago**, con una pasarela alternativa simulada detrás de una interfaz común.
- **Nodemailer** para correo y proveedores intercambiables SMTP/consola.
- **Multer** para subida de archivos y un proveedor de almacenamiento local detrás de una interfaz.
- **@nestjs/schedule** para tareas programadas y **@nestjs/terminus** para health checks.
- **RxJS** y **reflect-metadata** como parte del entorno NestJS.
- **Vitest 4**, **@nestjs/testing**, **Supertest** y cobertura V8 para pruebas unitarias y de integración/e2e.
- **Oxlint** con análisis de tipos, **Prettier**, **Nest CLI** y **ts-node** para lint, formato, compilación y utilidades TypeScript.

### Infraestructura local

- **Docker Compose** en la raíz levanta PostgreSQL (`localhost:5433`, puerto interno 5432), **Adminer** (`localhost:8080`) y **Mailpit** (SMTP en 1025, bandeja web en 8025).
- Frontend y API se ejecutan por separado con sus scripts npm; las direcciones de desarrollo documentadas son `http://localhost:5173` y `http://localhost:3000`.
- Usar `frontend/envExample` y `backend/envExample` como referencia para configurar el entorno. No publicar secretos ni sobrescribir archivos `.env` existentes.

## Arquitectura y organización

### Frontend

- Mantener `pages/` para pantallas, `router/` para rutas, `components/` para componentes compartidos y `features/` para lógica y componentes de cada funcionalidad.
- Mantener acceso HTTP en `services/`, estado compartido en `store/`, contratos en `types/` y estilos globales en `styles/`.
- Reutilizar hooks, componentes y servicios existentes antes de crear otros.
- Gestionar datos remotos con React Query y estado del cliente con Zustand cuando corresponda. Evitar duplicar los mismos datos en varios stores y cachés.
- Preferir composición y hooks en React; aplicar los principios de diseño sin convertir componentes en clases por obligación.

### Backend

- Mantener módulos por dominio en `src/modules/`, infraestructura en `src/providers/`, configuración en `src/config/`, utilidades compartidas en `src/common/` y migraciones en `src/migrations/`.
- Los controladores reciben solicitudes y delegan; los servicios coordinan casos de uso y reglas de negocio; los DTOs validan entradas y las entidades representan persistencia.
- Respetar límites entre módulos, proveedores e interfaces existentes. Evitar dependencias circulares y acceso a detalles internos de otros módulos.
- Conservar las abstracciones de pasarela de pagos, correo y almacenamiento; no acoplar la lógica de dominio a los SDKs externos.

## Principios SOLID y GRASP

Aplicarlos en cada cambio de manera proporcional al problema, con alta cohesión, bajo acoplamiento y código fácil de entender y probar. No crear capas, interfaces o jerarquías sin una necesidad concreta.

### SOLID

- **Responsabilidad única:** cada componente, hook, clase o función debe tener una responsabilidad clara y un motivo coherente para cambiar.
- **Abierto/cerrado:** favorecer extensiones mediante composición y contratos cuando haya variaciones reales; evitar condicionales repetidos por proveedor o tipo.
- **Sustitución de Liskov:** las implementaciones de un contrato deben respetar su comportamiento esperado, incluidos errores y resultados.
- **Segregación de interfaces:** definir contratos pequeños para las necesidades de sus consumidores.
- **Inversión de dependencias:** separar políticas de negocio de infraestructura; usar contratos y tokens de inyección de NestJS donde corresponda.

### GRASP

- **Experto en información:** asignar una regla al elemento que dispone de los datos necesarios para resolverla.
- **Creador:** ubicar la creación de objetos donde exista la responsabilidad y el contexto adecuados.
- **Controlador:** coordinar las entradas del sistema sin concentrar toda la lógica en controladores HTTP o pantallas.
- **Bajo acoplamiento y alta cohesión:** mantener responsabilidades relacionadas juntas y reducir dependencias innecesarias.
- **Polimorfismo:** resolver comportamientos intercambiables mediante contratos cuando resulte más claro que ramificaciones repetidas.
- **Fabricación pura e indirección:** usar servicios o adaptadores auxiliares cuando permitan separar dominio e infraestructura.
- **Variaciones protegidas:** encapsular puntos que pueden cambiar, como pagos, correo, almacenamiento y acceso a APIs.

## Patrones de diseño

- Elegir patrones para resolver una necesidad identificable. Explicar brevemente su propósito si el cambio introduce una abstracción relevante. No forzar patrones ni refactorizar código ajeno a la tarea para incorporarlos.
- **Singleton:** aprovechar el ciclo de vida compartido de los proveedores de NestJS cuando corresponda y conservar clientes compartidos como el `QueryClient` del frontend. Evitar singletons manuales con `getInstance()` o estado global mutable que dificulten el aislamiento y las pruebas.
- **Adapter:** encapsular SDKs y servicios externos detrás de contratos propios; tomar como referencia las pasarelas de pago y los proveedores de correo y almacenamiento existentes.
- **Observer:** usar suscripciones, eventos o mecanismos reactivos existentes cuando varios consumidores deban reaccionar a un cambio. Liberar suscripciones al finalizar su ciclo de vida y no añadir un bus de eventos para interacciones simples.
- **Strategy:** utilizar implementaciones intercambiables cuando un comportamiento varíe por proveedor o política, como la pasarela real y la simulada.
- **Factory:** centralizar la selección o creación de implementaciones cuando la configuración lo requiera, aprovechando las factories de proveedores de NestJS.
- Preferir composición a herencia y mantener contratos tipados. No introducir un repositorio genérico u otra capa adicional solo para envolver TypeORM sin aportar comportamiento útil.

## Diseño visual y experiencia del cliente

- Usar una paleta monocromática basada en blancos, negros y grises. Construir jerarquía mediante tonos, contraste, tipografía, tamaños y espacios.
- Mantener criterios coherentes para botones, tarjetas, formularios, tablas, navegación, bordes y estados interactivos. Centralizar valores visuales reutilizables cuando resulte útil.
- Priorizar navegación clara, exploración del catálogo, comprensión de precios y variantes, y un proceso de compra sencillo.
- Diseñar para celulares y escritorio, evitando desbordamientos y verificando los estados de carga, vacío, error, éxito y deshabilitado afectados por el cambio.
- Usar HTML semántico, etiquetas de formulario, foco visible, navegación por teclado, textos alternativos pertinentes y contraste legible.
- No depender únicamente del color para comunicar estados; acompañar con texto, iconos o formas distinguibles.
- Mantener mensajes claros en español y preservar los flujos de autenticación, carrito y compra durante cambios visuales.

## Reglas para modificar código

- Revisar el estado de Git antes de editar. Preservar cambios del usuario, incluidos cambios sin commit; no revertir ni sobrescribir trabajo ajeno.
- Limitar cada cambio a lo solicitado. Para tareas visuales, mantener el alcance en frontend; consultar antes de ampliar el trabajo a lógica de negocio, backend, contratos API, dependencias o estructura si esa ampliación no está autorizada por la tarea.
- Si la tarea ya autoriza esos cambios, proceder sin pedir una confirmación redundante.
- Mantener TypeScript tipado: evitar `any`, aserciones o supresiones de errores injustificadas. Validar datos externos en los límites del sistema.
- Seguir el formato y las convenciones de cada carpeta; no reformatear archivos completos sin necesidad.
- No agregar librerías cuando las herramientas actuales resuelvan el problema. No editar lockfiles manualmente ni actualizar paquetes como efecto secundario de otra tarea.
- No modificar artefactos generados (`dist/`, `node_modules/`, `*.tsbuildinfo`) como fuente de una solución.
- No cambiar migraciones ya aplicadas para introducir nuevos cambios de esquema; crear una migración nueva cuando la tarea lo requiera.
- No exponer credenciales, tokens ni datos sensibles en código, mensajes o logs.
- Mantener este archivo actualizado cuando cambien las tecnologías o convenciones del proyecto.

## Verificación y entrega

Ejecutar los comandos desde la carpeta indicada y seleccionar los pertinentes al alcance del cambio:

| Carpeta | Comando | Finalidad |
| --- | --- | --- |
| `frontend/` | `npm run dev` | Desarrollo con Vite |
| `frontend/` | `npm run lint` | Análisis estático |
| `frontend/` | `npm run build` | Verificación TypeScript y build |
| `frontend/` | `npm test` | Pruebas unitarias y de componentes |
| `backend/` | `npm run start:dev` | Desarrollo con NestJS |
| `backend/` | `npm run typecheck` | Verificación de tipos, incluidos tests |
| `backend/` | `npm run lint` | Análisis estático con tipos |
| `backend/` | `npm run build` | Compilación |
| `backend/` | `npm test` | Pruebas unitarias |
| `backend/` | `npm run test:e2e` | Pruebas e2e con base de datos |
| `backend/` | `npm run migration:run` | Aplicar migraciones pendientes |
| `backend/` | `npm run seed` | Cargar datos de demostración y administrador configurado |
| Raíz | `docker compose up -d` | Iniciar servicios locales |

- Los e2e escriben en la base configurada; comprobar que sea una base de pruebas adecuada antes de ejecutarlos. No ejecutar migraciones o seed solo por un cambio visual o documental.
- Añadir o ajustar pruebas cuando cambie comportamiento relevante. Para ajustes visuales simples, priorizar build, lint y revisión visual; no crear tests que solo repliquen estilos o implementación.
- Revisar en navegador los cambios de interfaz cuando esté disponible, contemplando tamaños de celular y escritorio. Si no se puede, comunicar la limitación.
- Los cambios exclusivamente documentales requieren revisar contenido y diff; no necesitan compilar aplicaciones.
- Al entregar, resumir qué cambió, cómo se verificó y cualquier limitación o comprobación pendiente. No declarar pruebas o revisión visual que no se hayan realizado.
