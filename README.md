# CuentaVecina — versión preliminar

App web para que bodegas y comercios de barrio lleven la cuenta corriente de lo que fían a sus vecinos.
SI642 Finanzas e Ingeniería Económica — UPC — Grupo 03.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4 · Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions).

## 1. Puesta en marcha (cada integrante)

1. Node 24 LTS y ejecutar **una vez** `config-npm/configurar-npm-seguro.ps1` (PowerShell normal, no administrador):
   `powershell -ExecutionPolicy Bypass -File .\config-npm\configurar-npm-seguro.ps1`
2. Solo la primera vez, en esta carpeta (PowerShell):
   `Copy-Item config-npm\.npmrc .npmrc` y `Copy-Item .env.example .env.local`
   En `.env.local` pon la *publishable key* (Supabase → Project Settings → API Keys). Es pública; nunca pongas la *secret key*.
3. `npm ci` (instala exactamente lo del `package-lock.json`).
4. `npm run dev` → http://localhost:5173

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas del motor financiero (juegos de datos 1 y 2) |
| `npm run build` | Compila (verifica tipos) a `dist/` |
| `npm run lint` | Revisión de código (oxlint) |

## 2. Primer administrador del sistema

No se envían correos (el SMTP incluido en Supabase permite solo 2 por hora), así que el primer usuario se crea a mano:

1. Supabase → **Authentication → Users → Add user → Create new user**: correo `admin@usuarios.cuentavecina.pe`, una contraseña, marcar **Auto Confirm User**.
2. **SQL Editor**: `select public.fn_promover_admin_sistema('admin@usuarios.cuentavecina.pe', 'Tu nombre');`
3. Iniciar sesión en la app con usuario `admin`.

Desde ahí, todo se crea desde la app (sin correos): el admin del sistema da de alta tiendas y sus administradores
(o aprueba solicitudes de "Registra tu negocio"), y cada tienda crea a sus clientes y les genera usuario (su DNI).

## 3. Cómo está organizado

```
src/
  lib/motorFinanciero.ts      Fórmulas (TEP, ciclo de corte, fin de mes, francés, mora) — modelo de referencia
  lib/motorFinanciero.test.ts Juegos de datos de prueba (valores verificados con Python Decimal)
  lib/codigos.ts              Traducción de códigos de la BD (períodos 0–7, tipo de tasa, moneda, modalidad)
  lib/fechas.ts               Fechas en hora de Lima
  context/AuthContext.tsx     Sesión + perfil + tienda
  routes/ProtectedRoute.tsx   Rutas por rol
  pages/sistema/              Admin del sistema: tiendas, solicitudes, tasas BCRP
  pages/tienda/               Admin del negocio: inicio (listado de pagos), nueva venta, cobranza, clientes, productos
  pages/cliente/MiCuenta.tsx  Portal del cliente (solo lectura)
supabase/
  migrations/002_*.sql        Motor financiero en BD, RLS, auditoría, solicitudes, Storage (ya aplicada)
  migrations/003_*.sql        Ajuste de fn_deuda_vigente (ya aplicada)
  functions/admin-usuarios/   Edge Function: crea usuarios sin correo, restablece claves (ya desplegada)
```

## 4. Decisiones de diseño (para el informe y la exposición)

- **El cálculo oficial vive en PostgreSQL** (`simular_venta`, `registrar_venta`, `estado_cuenta`, `registrar_pago`).
  El navegador muestra una simulación con `motorFinanciero.ts`, pero al guardar la BD recalcula todo; nadie puede
  manipular montos desde el navegador. Ambas implementaciones dan el mismo resultado al centavo en los juegos de datos.
- **Ventas, cuotas y pagos solo se escriben por funciones RPC** (no hay política RLS de escritura directa).
- **Validaciones en la BD:** límite de crédito, plazo máximo, modalidad del producto, tasas ≤ tope BCRP vigente,
  sin pagos parciales, períodos en orden, fechas no futuras.
- **Convenciones (Anexo A):** año de 360 días, mes de 30, montos a 2 decimales, tasas con precisión completa
  (se muestran con 7 decimales), prelación mora → interés compensatorio → capital.
- **Fecha y hora de corte en hora de Lima** (`tiendas.hora_corte`), aunque Supabase guarde en UTC.
- **Auditoría:** cada INSERT/UPDATE/DELETE de las tablas de negocio queda en `auditoria` (quién, cuándo, antes/después).
- **Interés moratorio:** tasa moratoria pactada sobre el total del período por los días de atraso. *Pendiente confirmar
  con el docente* si durante la mora también corre el interés compensatorio.

## 5. Pendiente para la versión final

- Cargar las tasas máximas BCRP vigentes (pantalla *Tasas BCRP*). Ojo: un comercio no es entidad financiera; revisar
  qué tope aplica ("operaciones entre personas ajenas al sistema financiero").
- Precios de productos para clientes en dólares (hoy el catálogo está en soles).
- PWA (instalable/offline) y despliegue (Vercel/Netlify).
- Generar los tipos de la BD (`supabase gen types`) para tipar el cliente de Supabase.
