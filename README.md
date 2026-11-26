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

## 2. Primer administrador del sistema (desde la app)

Con la base de datos vacía, la pantalla de inicio de sesión muestra **"Primera vez aquí → Configurar CuentaVecina"**:
ahí se crea el administrador del sistema y se entra directo. Esa pantalla se cierra para siempre en cuanto existe
un administrador (lo valida la Edge Function `admin-usuarios`, acción `instalar`). Para exigir además un código,
definir el secret `CODIGO_INSTALACION` en Supabase.

Desde ahí, todo se crea desde la app (sin correos): el admin del sistema da de alta tiendas y sus administradores
(o aprueba solicitudes de "Registra tu negocio") y otros administradores del sistema; cada tienda crea a sus clientes
y les genera usuario (su DNI).

**Ruta de prueba en vivo:** [`docs/RUTA_DE_PRUEBA.md`](docs/RUTA_DE_PRUEBA.md) (también en la pantalla *Ayuda*).
Para empezar de cero antes de una demo: `supabase/scripts/reiniciar_demo.sql` (**borra todos los datos**).

## 3. PWA y notificaciones

- **Instalable:** `vite-plugin-pwa` con service worker propio (`src/sw/sw.ts`): guarda la app en caché (abre sin
  internet) pero **nunca** guarda datos de Supabase. Al publicar una versión nueva, la app muestra "Actualizar".
  La PWA solo se activa en el build (`npm run build && npm run preview`, o en Vercel), no en `npm run dev`.
- **Avisos dentro de la app (🔔):** tabla `notificaciones`, creada solo por triggers de la BD:
  - Cliente: *Nueva compra registrada*, *Pago recibido*, recordatorios (3 días antes, 1 día antes, el mismo día) y
    *Pago vencido* (1, 3, 7, 15 y 30 días).
  - Administrador del negocio: *Cobranza del día* (cuántos vencen hoy y cuántos están vencidos).
  - Los recordatorios los genera `pg_cron` todos los días a las 8:00 a. m. de Lima (`fn_generar_recordatorios`).
  - La campana se actualiza al instante con Supabase Realtime (respeta RLS).
- **Push al celular (opcional):** cuando hay una notificación nueva y el usuario activó "Recibir avisos en este
  dispositivo", la BD llama (pg_net) a la Edge Function `enviar-push`, que la envía con Web Push. Para activarlo:
  1. `npx web-push generate-vapid-keys` (una sola vez; guarda las dos llaves).
  2. Supabase → Edge Functions → **Secrets**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`
     (`mailto:` de contacto del grupo).
  3. `VITE_VAPID_PUBLIC_KEY` = la llave **pública** en `.env.local` y en Vercel → Environment Variables; volver a desplegar.
  4. Necesita HTTPS (Vercel) o `localhost`. En iPhone solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+).

## Despliegue en Vercel

1. Vercel → **Add New → Project** → importar el repo de GitHub (detecta Vite; la configuración está en `vercel.json`).
2. **Environment Variables**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (los mismos valores de `.env.local`).
   Si faltan, el build falla a propósito con un mensaje claro.
3. Deploy. Luego restringir CORS de las Edge Functions al dominio final:
   `supabase secrets set ORIGEN_PERMITIDO=https://<tu-app>.vercel.app`
4. El plan gratuito de Supabase pausa el proyecto por inactividad: abrir la app un día antes de la revisión.

## 4. Cómo está organizado

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
  pages/Instalacion.tsx       Configuración inicial (primer administrador del sistema)
  components/Notificaciones.tsx  Campana 🔔 (Realtime) y activación de push
  components/PrimerosPasos.tsx   Guía de primeros pasos por rol (ruta de prueba)
  components/Pwa.tsx          Registro del service worker, "Actualizar" e "Instalar app"
  sw/sw.ts                    Service worker: caché de la app y notificaciones push
supabase/
  migrations/002_*.sql        Motor financiero en BD, RLS, auditoría, solicitudes, Storage (ya aplicada)
  migrations/003_*.sql        Ajuste de fn_deuda_vigente (ya aplicada)
  migrations/004_*.sql        Quita al rol anon todo permiso salvo enviar solicitudes (defensa en profundidad)
  migrations/005_*.sql        Instalación inicial, notificaciones, recordatorios (pg_cron) y suscripciones push
  scripts/reiniciar_demo.sql  Deja la base en blanco para una demo (BORRA TODO)
  functions/_shared/          Utilidades comunes de las Edge Functions (CORS, errores, claves)
  functions/admin-usuarios/   Edge Function: crea usuarios sin correo, restablece claves
  functions/enviar-push/      Edge Function: envía las notificaciones push (Web Push, llaves VAPID)
  functions/asistente/        Edge Function: chat de ayuda (modelo de NVIDIA); a los clientes les lee su cuenta con su propio token
```

## 5. Seguridad

| Valor | Dónde vive | ¿Es secreto? |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` → se incrustan en el JS del navegador | **No.** Son públicas por diseño; lo que protege los datos es RLS. |
| Secret key / `service_role` | Solo en las Edge Functions (Supabase la inyecta) | **Sí.** Nunca en el frontend ni en git. |
| `NVIDIA_API_KEY` | Secret de Supabase (`supabase secrets set`) | **Sí.** |
| `ORIGEN_PERMITIDO` | Secret de Supabase | No; restringe CORS al dominio desplegado. |
| `VITE_VAPID_PUBLIC_KEY` / `VAPID_PUBLIC_KEY` | `.env.local` + Vercel / secret de Supabase | **No** (es pública). |
| `VAPID_PRIVATE_KEY` | Secret de Supabase | **Sí.** Nunca en el frontend ni en git. |
| `CODIGO_INSTALACION` (opcional) | Secret de Supabase | Sí; protege la configuración inicial. |

- Todas las tablas tienen RLS y cada política exige rol **y** tienda/cliente. Ventas, cuotas y pagos no tienen política de
  escritura: solo se escriben por `registrar_venta` / `registrar_pago`, que verifican quién llama.
- Las funciones `security definer` que el linter de Supabase marca (`fn_rol_actual`, `fn_deuda_vigente`, `registrar_*`…) son
  intencionales: validan `auth.uid()` por dentro y solo devuelven datos del propio usuario o de su tienda.
- Las Edge Functions no devuelven detalles de errores internos (solo los registran en los logs).
- Solo `.env.example` se versiona (`.gitignore` excluye `.env` y `.env.*`).


## 6. Decisiones de diseño (para el informe y la exposición)

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

## 7. Pendiente para la versión final

- Cargar las tasas máximas BCRP vigentes (pantalla *Tasas BCRP*). Ojo: un comercio no es entidad financiera; revisar
  qué tope aplica ("operaciones entre personas ajenas al sistema financiero").
- Configurar las llaves VAPID para activar los avisos push en el celular (ver sección 3).
- Generar los tipos de la BD (`supabase gen types`) para tipar el cliente de Supabase.
- Versionar el esquema base: la migración `001` (tablas) se aplicó desde el panel y no está en el repo.
  Recuperarla con `supabase db pull` para que el proyecto se pueda reconstruir desde cero.
