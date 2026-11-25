# Graph Report - CuentaVecina  (2026-11-24)

## Corpus Check
- Corpus is ~39,227 words - fits in a single context window. You may not need a graph.

## Summary
- 523 nodes · 1431 edges · 41 communities (34 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 45 edges (avg confidence: 0.85)
- Token cost: 455,510 input · 0 output

## Community Hubs (Navigation)
- App Routing & Pages
- Search & Form Components
- Notebook Schedule UI
- Admin Actions & Edge Calls
- Finance Engine & Dates
- TS App Config
- Supabase Edge Functions
- Notifications & Push
- TS Node Config
- TS Service Worker Config
- Dev Dependencies
- Runtime Dependencies
- Schedule Calculation Design
- Package Manifest
- Edge Functions & Reminders
- Payments & DB Migrations
- Supabase Security Model
- Vite Build Tooling
- Auth & Role Routing
- Credit Validation Rules
- PWA Shell & Docs
- Workbox Service Worker
- PWA Install Prompt
- Vercel Deploy Config
- Oxlint Config
- npm Scripts
- Base SQL & Pending Items
- Favicon Brand Mark
- Deno Config
- Icon 512
- Maskable Icon
- Apple Touch Icon
- Icon 192
- Notification Badge Icon
- TS Root Config
- Lima Timezone Dates
- Products Table
- Stores Table
- DB Error Codes
- Demo Reset Script

## God Nodes (most connected - your core abstractions)
1. `mensajeError()` - 56 edges
2. `NuevaVenta()` - 30 edges
3. `Boton()` - 29 edges
4. `react` - 28 edges
5. `Campo()` - 27 edges
6. `Alerta()` - 27 edges
7. `Etiqueta()` - 26 edges
8. `useAuth()` - 26 edges
9. `formatearFecha()` - 24 edges
10. `MiCuenta()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Migración 004 (rol anon sin permisos salvo solicitudes)` --implements--> `Row Level Security multi-tenant`  [INFERRED]
  README.md → CuentaVecina_Roadmap_Desarrollo.md
- `Convenciones Anexo A (año 360, mes 30, 2 decimales, prelación)` --semantically_similar_to--> `Prelación de pagos (mora → interés compensatorio → capital)`  [INFERRED] [semantically similar]
  README.md → CuentaVecina_Roadmap_Desarrollo.md
- `lib/motorFinanciero.ts (TEP, ciclo de corte, fin de mes, francés, mora)` --semantically_similar_to--> `motorFinanciero.js (TED, TEM, cronograma francés, puro y testeable)`  [INFERRED] [semantically similar]
  README.md → CuentaVecina_Roadmap_Desarrollo.md
- `Decisión: el cálculo oficial vive en PostgreSQL` --semantically_similar_to--> `Decisión: cálculo del cronograma en función RPC de Postgres`  [INFERRED] [semantically similar]
  README.md → CuentaVecina_Roadmap_Desarrollo.md
- `Supabase publishable key (pública, protegida por RLS)` --semantically_similar_to--> `Solo anon key en frontend; service_role nunca expuesta`  [INFERRED] [semantically similar]
  README.md → CuentaVecina_Roadmap_Desarrollo.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Reglas del motor financiero (límite, BCRP, prelación, francés, traslado)** — cuentavecina_roadmap_desarrollo_limite_credito, cuentavecina_roadmap_desarrollo_validacion_bcrp, cuentavecina_roadmap_desarrollo_prelacion_pagos, cuentavecina_roadmap_desarrollo_metodo_frances, cuentavecina_roadmap_desarrollo_traslado_periodo [EXTRACTED 1.00]
- **Escritura de ventas/cuotas/pagos solo vía RPC security definer** — readme_rpc_registrar_venta, readme_rpc_registrar_pago, readme_rpc_simular_venta, readme_rpc_estado_cuenta, readme_security_definer_functions, readme_calculo_oficial_postgres [EXTRACTED 1.00]
- **Flujo de notificaciones: triggers/pg_cron → tabla → Realtime/push** — readme_fn_generar_recordatorios, readme_notificaciones_tabla, readme_notificaciones_component, readme_edge_enviar_push, readme_service_worker, readme_vapid_keys [EXTRACTED 1.00]

## Communities (41 total, 7 thin omitted)

### Community 0 - "App Routing & Pages"
Cohesion: 0.06
Nodes (69): lucide-react, react, react-router-dom, Administradores, App(), Ayuda, Bcrp, Clientes (+61 more)

### Community 1 - "Search & Form Components"
Cohesion: 0.09
Nodes (44): Buscador(), abrir(), cerrar(), elegir(), teclas(), Control, leer(), OpcionBuscador (+36 more)

### Community 2 - "Notebook Schedule UI"
Cohesion: 0.15
Nodes (44): Cronograma(), FilaCrono, Condiciones(), Hoja(), MargenFecha(), MontoGrande(), Renglon(), RenglonTitulo() (+36 more)

### Community 3 - "Admin Actions & Edge Calls"
Cohesion: 0.13
Nodes (28): enviar(), adminUsuarios(), mensajeError(), cargar(), enviar(), enviar(), enviar(), Administradores() (+20 more)

### Community 4 - "Finance Engine & Dates"
Cohesion: 0.21
Nodes (19): aISO(), aUTC(), diffDias(), fechaDelMes(), sumarMeses(), calcularMora(), Ciclo, CondicionesCredito (+11 more)

### Community 5 - "TS App Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+12 more)

### Community 6 - "Supabase Edge Functions"
Cohesion: 0.24
Nodes (13): crearCuenta(), normalizarUsuario(), perfilAdministrable(), validarPassword(), datosCliente(), hoyLima(), limpiarMensajes(), ROLES (+5 more)

### Community 7 - "Notifications & Push"
Cohesion: 0.24
Nodes (14): hace(), ICONO, IconoAviso(), Notificaciones(), cambiarPush(), activarPush(), desactivarPush(), EstadoPush (+6 more)

### Community 8 - "TS Node Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 9 - "TS Service Worker Config"
Cohesion: 0.12
Nodes (15): compilerOptions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit, noUnusedLocals (+7 more)

### Community 10 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): devDependencies, oxlint@^1.89.0, tailwindcss@4.3.4, @types/node@^24.19.2, @types/react@^19.3.0, @types/react-dom@^19.3.0, vitest@5.1.0, workbox-window@7.4.1 (+7 more)

### Community 11 - "Runtime Dependencies"
Cohesion: 0.17
Nodes (12): dependencies, @fontsource/atkinson-hyperlegible-next@5.3.0, @fontsource/bricolage-grotesque@5.3.0, lucide-react@1.74.0, react@^19.3.1, react-dom@^19.3.1, react-router-dom@7.18.5, @supabase/supabase-js@2.118.0 (+4 more)

### Community 12 - "Schedule Calculation Design"
Cohesion: 0.20
Nodes (8): Tabla cuotas (cronograma francés), Fases de desarrollo 0–6, Método francés vencido simple ordinario (cuota constante), motorFinanciero.js (TED, TEM, cronograma francés, puro y testeable), Interés moratorio sobre total del período por días de atraso, lib/motorFinanciero.test.ts (juegos de datos 1 y 2, verificados con Python Decimal), lib/motorFinanciero.ts (TEP, ciclo de corte, fin de mes, francés, mora), RPC simular_venta

### Community 13 - "Package Manifest"
Cohesion: 0.18
Nodes (10): typescript@~7.0.2, engines, node, name, overrides, glob, private, type (+2 more)

### Community 14 - "Edge Functions & Reminders"
Cohesion: 0.24
Nodes (10): Edge Function de notificaciones (recordatorio de pago, opcional), Edge Function admin-usuarios (crea usuarios sin correo, acción instalar), Edge Function asistente (chat de ayuda con modelo NVIDIA), Edge Function enviar-push (Web Push, VAPID), functions/_shared (CORS, errores, claves), fn_generar_recordatorios (pg_cron diario 8:00 Lima), Instalación inicial: primer administrador del sistema (Instalacion.tsx), Migración 005 (instalación inicial, notificaciones, pg_cron, suscripciones push) (+2 more)

### Community 15 - "Payments & DB Migrations"
Cohesion: 0.22
Nodes (8): Tabla pagos, Prelación de pagos (mora → interés compensatorio → capital), Tabla auditoria (INSERT/UPDATE/DELETE de tablas de negocio), Migración 002 (motor financiero en BD, RLS, auditoría, solicitudes, Storage), Migración 003 (ajuste fn_deuda_vigente), pages/tienda (inicio, nueva venta, cobranza, clientes, productos), RPC registrar_pago, RPC registrar_venta

### Community 16 - "Supabase Security Model"
Cohesion: 0.25
Nodes (7): Checklist de seguridad (RLS, policies, trigger, CHECK), CuentaVecina PWA (Roadmap de Desarrollo), Supabase como backend único (Auth, PostgreSQL, RLS, Edge Functions), TP_Finanzas_Grupo3_ModeloBD.docx, Migración 004 (rol anon sin permisos salvo solicitudes), Supabase publishable key (pública, protegida por RLS), Despliegue en Vercel (vercel.json, ORIGEN_PERMITIDO CORS)

### Community 17 - "Vite Build Tooling"
Cohesion: 0.22
Nodes (8): @tailwindcss/vite@4.3.4, vite@^8.3.5, vite-plugin-pwa@2.0.0, @vitejs/plugin-react@^6.1.2, @tailwindcss/vite, vite, vite-plugin-pwa, @vitejs/plugin-react

### Community 18 - "Auth & Role Routing"
Cohesion: 0.32
Nodes (8): AuthContext (sesión + perfil + rol), Tabla perfiles (auth.users ↔ rol), ProtectedRoute (ruteo por rol), Enum rol_usuario (admin_sistema, admin_tienda, cliente), context/AuthContext.tsx (sesión + perfil + tienda), pages/cliente/MiCuenta.tsx (portal del cliente, solo lectura), routes/ProtectedRoute.tsx (rutas por rol), RPC estado_cuenta

### Community 19 - "Credit Validation Rules"
Cohesion: 0.29
Nodes (7): Tabla clientes (condiciones de crédito), Regla límite de crédito (trg_ventas_validar_limite / fn_validar_limite_credito), Tabla parametros_bcrp (tasas máximas BCRP), Período de gracia / traslado de período, Validación tasa pactada ≤ tope BCRP, Tabla ventas (compra a crédito), Validaciones en la BD (límite, plazo, modalidad, tope BCRP, sin pagos parciales, fechas)

### Community 20 - "PWA Shell & Docs"
Cohesion: 0.25
Nodes (8): vite-plugin-pwa (manifest + service worker), index.html (shell de la PWA, meta theme-color y Apple web app), Entrada /src/main.tsx montada en #root, CuentaVecina — versión preliminar (README), components/PrimerosPasos.tsx (guía por rol), components/Pwa.tsx (registro SW, Actualizar, Instalar app), docs/RUTA_DE_PRUEBA.md, Service worker propio src/sw/sw.ts (caché de app, nunca datos de Supabase)

### Community 21 - "Workbox Service Worker"
Cohesion: 0.25
Nodes (7): workbox-core@7.4.1, workbox-precaching@7.4.1, workbox-routing@7.4.1, workbox-core, workbox-precaching, workbox-routing, DatosPush

### Community 22 - "PWA Install Prompt"
Cohesion: 0.29
Nodes (4): esIOS, EventoInstalar, leerOculto(), Pwa()

### Community 23 - "Vercel Deploy Config"
Cohesion: 0.29
Nodes (6): buildCommand, framework, headers, installCommand, outputDirectory, rewrites

### Community 24 - "Oxlint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 25 - "npm Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, preview, test

### Community 26 - "Base SQL & Pending Items"
Cohesion: 0.40
Nodes (5): 000_stub_auth_local.sql (solo pruebas locales), 001_cuentavecina_schema.sql (migración base), pages/sistema (tiendas, solicitudes, tasas BCRP), Pendientes versión final (tasas BCRP, USD, VAPID, supabase gen types, versionar 001), Llaves VAPID (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VITE_VAPID_PUBLIC_KEY)

### Community 27 - "Favicon Brand Mark"
Cohesion: 0.40
Nodes (5): C2PA Provenance Manifest (Claude-generated), House + Ledger Lines Brand Mark, CuentaVecina Favicon (house with ledger lines), Neighborhood Store Account Book (Cuaderno de Fiado), Teal Brand Color #0f766e

### Community 28 - "Deno Config"
Cohesion: 0.40
Nodes (4): lint, rules, nodeModulesDir, exclude

### Community 29 - "Icon 512"
Cohesion: 0.50
Nodes (4): House with ledger lines motif (neighborhood store notebook), CuentaVecina PWA Icon 512px, PWA app icon (home screen / splash), Teal brand color (#10766C-ish) on rounded square

### Community 30 - "Maskable Icon"
Cohesion: 0.67
Nodes (4): House with Ledger Lines Motif (neighborhood store notebook), CuentaVecina Maskable PWA Icon (512px), PWA Maskable Icon Safe Zone (centered glyph, full-bleed background), Teal Brand Background Color

### Community 31 - "Apple Touch Icon"
Cohesion: 1.00
Nodes (3): House with Ledger Lines Brand Mark, Apple Touch Icon (PWA home-screen icon), Teal/Green Brand Background Color

### Community 32 - "Icon 192"
Cohesion: 1.00
Nodes (3): CuentaVecina PWA App Icon (192px), House with Ledger Lines Motif (neighborhood store / notebook account), Teal Green Brand Color

### Community 33 - "Notification Badge Icon"
Cohesion: 0.67
Nodes (3): Insignia 96px Monochrome Notification Badge Icon, Push Notification Badge (status bar glyph), CuentaVecina PWA Icon Set

## Ambiguous Edges - Review These
- `Edge Function asistente (chat de ayuda con modelo NVIDIA)` → `RPC estado_cuenta`  [AMBIGUOUS]
  README.md · relation: shares_data_with

## Knowledge Gaps
- **33 isolated node(s):** `Tabla tiendas`, `Tabla productos`, `Tabla cuotas (cronograma francés)`, `Tabla pagos`, `Tabla parametros_bcrp (tasas máximas BCRP)` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 165 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Routing & Pages` to `Search & Form Components`, `Notebook Schedule UI`, `Notifications & Push`, `Runtime Dependencies`, `Package Manifest`, `PWA Install Prompt`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `Tabla tiendas`, `Tabla productos`, `Tabla cuotas (cronograma francés)` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Routing & Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.06374829001367989 - nodes in this community are weakly interconnected._
- **Why does `mensajeError()` connect `Admin Actions & Edge Calls` to `App Routing & Pages`, `Search & Form Components`, `Notebook Schedule UI`, `Notifications & Push`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `Search & Form Components` be split into smaller, more focused modules?**
  _Cohesion score 0.09154437456324249 - nodes in this community are weakly interconnected._
- **Why does `lucide-react` connect `App Routing & Pages` to `Search & Form Components`, `Notebook Schedule UI`, `Notifications & Push`, `Runtime Dependencies`, `Package Manifest`, `PWA Install Prompt`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Edge Function asistente (chat de ayuda con modelo NVIDIA)` and `RPC estado_cuenta`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._