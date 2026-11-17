# e-commerce-titulo-intermedio
proyecto académico con un e-commerce completamente funcional, aplicando lo visto durante 3 años de  ing. en sistemas para obtener el título "analista en sistemas" (planificación 2023)

La estructura general del proyecto es la siguiente:

## Esquema de directorios

```text
root/
├── backend/
│   ├── src/
│   │   ├── main.ts                     # Punto de entrada de NestJS
│   │   ├── app.module.ts
│   │   ├── config/                     # Variables de entorno, validación de config
│   │   ├── common/                     # Guards, Filters, Interceptors, Decorators, Pipes
│   │   ├── migrations/                 # Migraciones de TypeORM
│   │   ├── seed/                       # Datos de demo (npm run seed)
│   │   ├── providers/
│   │   │   ├── database/               # Config de TypeOrmModule, data source
│   │   │   ├── mail/
│   │   │   └── storage/
│   │   └── modules/
│   │       ├── auth/                   # JWT, Local strategy, Refresh tokens
│   │       ├── users/                  # Clientes, Admins, Roles, direcciones
│   │       ├── products/
│   │       │   ├── categories/
│   │       │   └── stock/
│   │       ├── cart/
│   │       ├── orders/
│   │       ├── payments/               # Webhooks e integración MercadoPago
│   │       ├── notifications/
│   │       └── health/                 # Health checks con Terminus
│   ├── test/                           # Tests e2e
│   └── envExample
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── shop/                   # Catálogo (/), detalle de producto, carrito
    │   │   ├── auth/                   # /login, /register, recuperar contraseña
    │   │   ├── account/                # Pedidos, direcciones, checkout
    │   │   ├── checkout/               # Pago simulado y resultado del pago
    │   │   └── admin/                  # Panel administrativo
    │   ├── router/                     # Definición de rutas
    │   ├── components/                 # Componentes de UI reutilizables (Button, Table, Toaster…)
    │   ├── features/                   # Lógica de dominio (hooks y componentes por módulo)
    │   ├── services/                   # Clientes de la API / fetchers
    │   ├── store/                      # Stores de Zustand
    │   ├── styles/                     # Entry de Tailwind y tema
    │   ├── types/                      # Interfaces de TypeScript
    │   └── test/                       # Setup de Vitest
    └── envExample
```

# comandos para levantar todo

docker compose up -d (si no funciona probar agregar --build) en main, back y front

back: 
--npm install (la primera vez)
--cp envExample .env (si no tenés el .env)
--npm run migration:run (corre migraciones pendientes)
--npm run seed (opcional: carga el catálogo de demo y el admin; antes completar SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en el .env. Se puede correr más de una vez sin duplicar nada)
--npm run start:dev (arranca todo)

front: 
--npm install (la primera vez)
--cp envExample (si no tenés el .env)
--npm run dev (te da el puerto, vas a http://localhost:[puerto])

Direcciones:
- Frontend: http://localhost:5173
- API: http://localhost:3000
- Adminer: http://localhost:8080. Entrás con servidor postgres, usuario, contraseña y base ecommerce.
- Mailpit: http://localhost:8025. Bandeja donde llegan todos los correos que manda el backend (verificación, reset, pedidos...).

tests:
back:
- unitarios: npm test
- end to end: npm run test:e2e (necesitan la base levantada; escriben en la misma base de desarrollo)
- tipos (incluye los tests): npm run typecheck
front:
- unitarios: npm test

CI: en cada push y pull request, GitHub Actions (.github/workflows/ci.yml) corre en los dos proyectos build, lint y tests; en el back además el typecheck, las migraciones, el seed y los e2e contra un Postgres propio.


# TODO:

**Desarrollo general:**

- [ ] filtros en pestaña stock de admin
- [ ] revisar penalización de tiempo por intentos fallidos de inicio de sesión
- [ ] ejecutable init para linux/windows que ejecute los comandos de iniciacion
- [ ] optimización codebase teniendo en cuenta SOLID, GRASP y patrones diseño.

**UX/UI:**

- [ ] decidir tema con equipo

**Seguridad:**

- [ ] protección contra ataques bruteforce desde múltiples IPs (clasificar en ip's de confianza, ver "device cookies" de Owasp)
- [ ] 2fa para perfiles administrador
- [ ] mail de aviso por inicio de sesión en dispositivo nuevo
- [ ] integración Have i been pwned (evita contraseñas filtradas)
- [ ] CAPTCHA(?)
- [ ] mostrar cuadro de confirmación para otorgar permisos de administrador
- [ ] perfil superadmin para desarrolladores

# BUGFIXES:

**Prioridad alta:**

- (nada por ahora)

**Prioridad media:**

- [ ] producto no se deshabilita al reservar totalmente el stock, solo muestra mensaje al momento de agregar al carrito, mejora UX (severidad media)

**Prioridad baja:**

- [ ] bugfix hover catálogo: ubuntu linux firefox (el zoom de la imagen y la sombra de las tarjetas funcionan con la pantalla táctil pero no con el mouse; ver `frontend/src/components/catalog/ProductCard.tsx`) (severidad baja)
- [ ] el mensaje de bloqueo de cuenta se stackea, limitar a uno (inicio de sesión) (severidad baja)