# CuentaVecina — Documentación de Desarrollo

> PWA para que pequeños comercios (bodegas, etc.) gestionen cuentas corrientes / crédito de sus clientes.
> Stack: **React + Tailwind CSS (PWA)** en frontend, **Supabase (PostgreSQL + Auth + Row Level Security)** como backend único.
> Curso: SI642 Finanzas e Ingeniería Económica — UPC — Grupo 03.

---

## 1. Resumen de la arquitectura

```
┌─────────────────────────────┐
│   React + Tailwind (PWA)    │  ← Frontend: 3 vistas por rol
│  (Vite + Workbox/vite-pwa)  │
└──────────────┬───────────────┘
               │ supabase-js (REST/Realtime)
┌──────────────▼───────────────┐
│           Supabase            │
│  - Auth (auth.users)          │
│  - PostgreSQL (public.*)      │
│  - Row Level Security (RLS)   │
│  - Edge Functions (opcional)  │
└────────────────────────────────┘
```

No hay backend propio (Node/Express, etc.): toda la lógica de acceso a datos pasa por Supabase, y el aislamiento entre tiendas (**multi-tenant**) se garantiza con RLS, no con código de aplicación. Esto es clave: cualquier validación "de negocio" debe existir **en dos capas** — en el frontend (UX, feedback inmediato) y en la base de datos (trigger o policy), porque el cliente nunca es confiable.

### Roles del sistema (enum `rol_usuario`)
| Rol | Qué ve / hace |
|---|---|
| `admin_sistema` | Ve todas las tiendas. Gestiona `parametros_bcrp`. Soporte técnico. |
| `admin_tienda` | Ve solo su tienda (`tienda_id`): sus productos, clientes, ventas, cuotas, pagos. |
| `cliente` | Portal de autoconsulta: ve solo su propio estado de cuenta (`cliente_id`). |

---

## 2. Modelo de base de datos (resumen)

Diagrama completo y diccionario de entidades: ver `TP_Finanzas_Grupo3_ModeloBD.docx` (sección MODELO DE BASE DE DATOS del informe).

| Tabla | Rol |
|---|---|
| `tiendas` | Comercio registrado en la plataforma |
| `perfiles` | Une `auth.users` con el rol de negocio (`admin_tienda`, `cliente`, `admin_sistema`) |
| `productos` | Catálogo de productos/servicios por tienda |
| `clientes` | Cliente de una tienda + condiciones de crédito pactadas (tasa, límite, día de corte/pago) |
| `ventas` | Compra a crédito (capital, modalidad fin de mes o cuotas) |
| `cuotas` | Cronograma francés — una fila por cuota |
| `pagos` | Registro de pago del cliente (liquida ventas y/o cuotas) |
| `parametros_bcrp` | Tasas máximas vigentes publicadas por el BCRP (validación legal) |

Scripts SQL ya generados (listos para ejecutar):
- **`001_cuentavecina_schema.sql`** → migración completa: tablas, enums, constraints, índices, trigger de límite de crédito, funciones de RLS y políticas. **Este es el que se corre en Supabase (SQL Editor o CLI).**
- **`000_stub_auth_local.sql`** → SOLO para pruebas en Postgres local/pgAdmin (crea un `auth.users` falso). Nunca ejecutar en Supabase real.

---

## 3. Reglas de negocio críticas (motor financiero)

Estas reglas vienen del informe (Anexo A / marco legal) y **deben implementarse igual en el frontend (para UX) y en la BD (ya están como trigger/constraint)**:

1. **Límite de crédito**: `deuda_vigente + monto_nueva_venta <= limite_credito`. Ya validado con `trg_ventas_validar_limite` (rechaza el INSERT con excepción si se excede).
2. **Validación BCRP**: la tasa pactada con el cliente (`tasa_compensatoria`, anualizada) no puede superar `tasa_max_pen` / `tasa_max_usd` vigente en `parametros_bcrp` según la moneda. Esto NO está como trigger todavía — hay que decidir si va en el frontend, en una Edge Function, o se agrega un trigger adicional (recomendado antes de producción).
3. **Prelación de pagos**: al registrar un `pago`, el orden de imputación es **mora → interés compensatorio → capital**.
4. **Método francés vencido simple ordinario**: el cronograma en `cuotas` (columnas `interes`, `amortizacion`, `cuota`, `saldo_final`) se calcula con cuota constante; la lógica de cálculo (TED, TEM, número de cuotas, etc.) vive en el frontend o en una función de Postgres — pendiente decidir dónde (ver Fase 3).
5. **Período de gracia / traslado de período** (`traslado_periodo` en `ventas`): si la compra es después del día de corte, se traslada al siguiente ciclo de facturación.

---

## 4. Fases de desarrollo sugeridas

### Fase 0 — Setup del proyecto
- [ ] Crear proyecto en Supabase (obtener `SUPABASE_URL` y `SUPABASE_ANON_KEY`).
- [ ] Ejecutar `001_cuentavecina_schema.sql` en el SQL Editor de Supabase.
- [ ] Verificar en **Table Editor** que las 8 tablas y las policies de RLS quedaron creadas.
- [ ] **Cada integrante, una sola vez:** instalar Node 24 LTS y ejecutar `config-npm/configurar-npm-seguro.ps1` (PowerShell normal, no administrador): `powershell -ExecutionPolicy Bypass -File .\config-npm\configurar-npm-seguro.ps1`. Deja npm ≥ 11.10 con `ignore-scripts`, `min-release-age=3` y `allow-git=none` a nivel de usuario.
- [ ] Scaffold del frontend: `npm create vite@latest cuentavecina -- --template react-ts`.
- [ ] Copiar `config-npm/.npmrc` a la raíz de `cuentavecina/` (junto a `package.json`) y subirlo a git junto con `package-lock.json`.
- [ ] Instalar dependencias: `npm install`, luego `npm install @supabase/supabase-js react-router-dom` y `npm install -D tailwindcss @tailwindcss/vite vite-plugin-pwa vitest`.
- [ ] Tailwind 4: agregar `tailwindcss()` (de `@tailwindcss/vite`) a los plugins de `vite.config.ts` y `@import "tailwindcss";` en el CSS principal (ya no se usa `tailwindcss init -p`).
- [ ] Supabase CLI: instalar con `scoop` (no como paquete npm: descarga su binario en un postinstall, que `ignore-scripts` bloquea).
- [ ] Reglas del equipo: tras clonar usar `npm ci` (no `npm install`); copiar nombres de paquetes desde la documentación oficial (evitar typosquatting); revisar el diff de `package-lock.json` en cada PR; correr `npm audit` y `npm audit signatures` antes de cada entrega; no usar `npm login` en las PCs del equipo.
- [ ] Instalar plugin PWA (`vite-plugin-pwa`) y configurar manifest (`name`, `icons`, `theme_color`) + service worker básico (cache de assets estáticos, estrategia network-first para llamadas a Supabase).
- [ ] Variables de entorno: `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (nunca subir a git — agregar a `.gitignore`).

### Fase 1 — Autenticación y control de acceso
- [ ] Pantalla de login (Supabase Auth — email/password o magic link).
- [ ] Al iniciar sesión, leer `perfiles` (por `auth.uid()`) para saber el `rol` y redirigir:
  - `admin_tienda` → dashboard de tienda
  - `cliente` → portal de autoconsulta
  - `admin_sistema` → panel de soporte
- [ ] Guardar el perfil en un contexto global de React (`AuthContext`) para no repetir la consulta.
- [ ] Ruteo protegido (`react-router-dom` + componente `<ProtectedRoute rol="admin_tienda">`).
- [ ] Probar que RLS realmente bloquea: loguear como tienda A e intentar leer clientes de tienda B (debe devolver vacío, no error — así es como responde RLS).

### Fase 2 — CRUD base (admin_tienda)
- [ ] Módulo **Productos**: listar/crear/editar (`precio_contado`, `precio_lista`, `modalidad_venta`).
- [ ] Módulo **Clientes**: alta de cliente con sus condiciones de crédito (tasa, límite, día de corte/pago, plazo máximo). Validar en el formulario los mismos rangos que los `CHECK` de la BD (evita que el usuario vea un error crudo de Postgres).
- [ ] Módulo **Tienda**: datos de la tienda (solo lectura/edición de perfil propio).

### Fase 3 — Motor financiero (el corazón del proyecto)
- [ ] Implementar en JS/TS las fórmulas del informe: TED, TEM, conversión de tasa nominal a efectiva, cálculo de cuotas (método francés).
  - Recomendación: crear un módulo puro `src/lib/motorFinanciero.js` con funciones testeables (sin dependencias de React ni Supabase), y escribir tests unitarios contra los 2 juegos de datos de prueba del informe (ya los tienes calculados y verificados — úsalos como casos de test).
- [ ] Módulo **Ventas**: al crear una venta, calcular `monto_capital`, generar el cronograma (`cuotas`) si es a plazos, e insertar todo en una transacción (RPC de Postgres o varias llamadas encadenadas).
- [ ] Módulo **Pagos**: registrar pago, aplicar prelación mora → interés → capital, actualizar `estado_pago` de ventas/cuotas afectadas.
- [ ] Considerar mover el cálculo del cronograma a una **función de Postgres (RPC)** en vez de hacerlo en el frontend — así queda validado en un solo lugar y no se puede manipular desde el cliente. (Recomendado si da tiempo; si no, documentarlo como limitación conocida del alcance del curso.)

### Fase 4 — Portal del cliente (rol `cliente`)
- [ ] Vista de solo lectura: estado de cuenta, cuotas pendientes, historial de pagos.
- [ ] Sin capacidad de escritura — todo protegido por las policies `*_cliente_select` ya definidas.

### Fase 5 — PWA / experiencia offline
- [ ] Manifest completo (ícono, splash screen, `display: standalone`).
- [ ] Estrategia de cache: assets estáticos con `CacheFirst`, llamadas a Supabase con `NetworkFirst` (o mostrar estado "sin conexión" si falla).
- [ ] Probar instalación en Android/Chrome (Lighthouse PWA audit).

### Fase 6 — Pulido, pruebas y despliegue
- [ ] Validaciones de formulario alineadas con los `CHECK` de la BD (documento/RUC numérico, día de corte < día de pago, etc.).
- [ ] Manejo de errores de Supabase legible para el usuario (traducir mensajes como el de `fn_validar_limite_credito`).
- [ ] Revisar advisories de seguridad/performance en Supabase (Dashboard → Advisors) antes de entregar.
- [ ] Deploy del frontend (Vercel/Netlify — cualquiera sirve para una PWA estática).
- [ ] Doble check final: que ninguna clave `service_role` de Supabase quede expuesta en el frontend (solo se usa la `anon key`, protegida por RLS).

---

## 5. Estructura de carpetas sugerida (frontend)

```
cuentavecina/
├── public/
│   └── manifest.json
├── src/
│   ├── lib/
│   │   ├── supabaseClient.js       # cliente único de supabase-js
│   │   └── motorFinanciero.js      # TED, TEM, cronograma francés (puro, testeable)
│   ├── context/
│   │   └── AuthContext.jsx         # sesión + perfil + rol actual
│   ├── routes/
│   │   └── ProtectedRoute.jsx
│   ├── pages/
│   │   ├── admin-tienda/
│   │   │   ├── Productos.jsx
│   │   │   ├── Clientes.jsx
│   │   │   ├── Ventas.jsx
│   │   │   └── Pagos.jsx
│   │   ├── portal-cliente/
│   │   │   └── EstadoCuenta.jsx
│   │   └── Login.jsx
│   ├── components/                 # UI reutilizable (tablas, modales, inputs)
│   └── App.jsx
├── .env.local                      # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (no commitear)
└── vite.config.js                  # incluye vite-plugin-pwa
```

---

## 6. Variables de entorno necesarias

| Variable | Dónde conseguirla | Uso |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Cliente `supabase-js` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (clave pública, protegida por RLS) | Cliente `supabase-js` |

---

## 7. Checklist de seguridad (antes de mostrar la demo/entregar)

- [ ] RLS **habilitado** en las 7 tablas de negocio (ya viene en el script).
- [ ] Ninguna policy usa `using (true)` sin querer (revisar que cada una filtre por tienda/cliente).
- [ ] La `anon key` es la única usada en el frontend — la `service_role key` nunca se expone.
- [ ] El trigger de límite de crédito sigue activo (no se deshabilitó durante pruebas).
- [ ] Los CHECK constraints de fechas/documentos siguen intactos.

---

## 8. Pendientes / decisiones abiertas para cuando retomes

- Dónde vive el cálculo del cronograma francés: ¿frontend puro o función RPC de Postgres? (recomendado: RPC, por seguridad).
- Si la validación BCRP (tasa pactada ≤ tasa máxima vigente) se agrega como trigger adicional en la BD o se deja solo en el frontend.
- Si se necesita una Edge Function para notificaciones (recordatorio de pago próximo a vencer) — no es parte del alcance mínimo del curso, pero suma como diferenciador.
