# e-commerce-titulo-intermedio
proyecto académico con un e-commerce completamente funcional, aplicando lo visto durante 3 años de  ing. en sistemas para obtener el título "analista en sistemas" (planificación 2023)

La estructura general del proyecto es la siguiente:

# esquema de directorios:

root/
├── backend/
│   ├── src/
│   │   ├── config/                     # Variables de entorno, validación de config
│   │   ├── common/                     # Guards, Filters, Interceptors, Decorators, Pipes
│   │   ├── providers/
│   │   │   ├── database/               # TypeOrmModule config, data source
│   │   │   ├── mail/
│   │   │   └── storage/
│   │   └── modules/
│   │       ├── auth/                   # JWT, Local strategy, Refresh tokens
│   │       ├── users/                  # Clientes, Admins, Roles
│   │       ├── products/
│   │       │   └── categories/
│   │       ├── cart/
│   │       ├── orders/
│   │       ├── payments/               # Webhooks e integración MercadoPago
│   │       └── health/                 # Terminus health checks
│   ├── test/
│   ├── main.ts
│   └── envExample                     
│
└── frontend/
    ├── src/
    │   ├── pages/                      
    │   │   ├── shop/                   # Home, /products, /
    │   │   ├── auth/                   # /login, /register
    │   │   ├── account/                # /profile, /orders
    │   │   └── admin/                  # Panel administrativo
    │   ├── router/                     # Definición de ruta
    │   ├── components/                 # UI atómicos (Butto
    │   ├── features/                   # Lógica de dominio mentForm)
    │   ├── services/                   # Clientes API / fetchers
    │   ├── store/                      # Stores de Zustand
    │   ├── styles/                     # Config/entry de Ta
    │   └── types/                      # Interfaces TypeScr
    └── envExample

# comandos para levantar todo

docker compose up -d (si no funciona probar agregar --build) en main, back y front

back: 
--npm install (la primera vez)
--cp envExample .env (si no tenés el .env)
--npm run migration:run (corre migraciones pendientes)
--npm run start:dev (arranca todo)

front: 
--npm install (la primera vez)
--cp envExample (si no tenés el .env)
--npm run dev (te da el puerto, vas a http://localhost:[puerto])

Direcciones:
- Frontend: http://localhost:5173
- API: http://localhost:3000
- Adminer: http://localhost:8080. Entrás con servidor postgres, usuario, contraseña y base ecommerce.

tests:
unitarios: npm test 
end to end: npm run test:e2e (necesitan la base levantada)