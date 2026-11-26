# Node y Deno en CuentaVecina

El proyecto usa dos entornos de JavaScript/TypeScript. Cada uno tiene su carpeta y su configuración, y no se mezclan.

## Por qué hay dos

- **Node**: solo se usa en la computadora de desarrollo, para las herramientas del frontend (Vite y React: `npm run dev` y `npm run build`). El resultado son archivos estáticos que corren en el navegador.
- **Deno**: las Edge Functions de Supabase (`supabase/functions/`) se ejecutan con Deno en los servidores de Supabase. Ahí no se puede usar Node.

Para quitar Deno habría que sacar las funciones de Supabase y llevarlas a otro servicio, como Vercel o Netlify. No vale la pena.

## Cómo están separados

| | Node (frontend) | Deno (funciones) |
|---|---|---|
| Carpeta | `src/` | `supabase/functions/` |
| Configuración | `package.json` y `tsconfig.app.json` (solo incluye `src`) | `supabase/functions/deno.json` |
| De dónde salen los paquetes | `node_modules` (`npm install`) | caché de Deno (`deno cache`) |
| Editor (VS Code) | TypeScript normal | extensión Deno, activa solo en `supabase/functions` (`.vscode/settings.json` → `deno.enablePaths`) |

### `supabase/functions/deno.json`

```json
{
  "nodeModulesDir": "none",
  "lint": {
    "rules": { "exclude": ["no-import-prefix"] }
  }
}
```

- `nodeModulesDir: "none"`: Deno usa su propio caché y no `node_modules`, igual que cuando Supabase despliega las funciones.
- Se desactiva la regla de lint `no-import-prefix` porque los imports `npm:` escritos en el código son el formato normal en las funciones de Supabase.

## Reglas

- Nunca importar código de `src/` dentro de `supabase/functions/`, ni al revés.
- El código compartido entre funciones va en `supabase/functions/_shared/` (por ejemplo, `http.ts`).
- Los paquetes en las funciones se importan con prefijo y versión fija, por ejemplo `import { createClient } from "npm:@supabase/supabase-js@2.118.0"`.

## Problema resuelto: `not-installed-npm`

**Síntoma:** en VS Code aparece este error en el import de una función:

```
npm package "@supabase/supabase-js@2.118.0" is not installed or doesn't exist. deno(not-installed-npm)
```

**Causa:** al encontrar el `package.json` de la raíz, Deno intentaba sacar los paquetes de `node_modules` en vez de usar su propio caché.

**Solución:** se creó `supabase/functions/deno.json` con `"nodeModulesDir": "none"` y se descargaron las dependencias.

Si el error vuelve, por ejemplo después de agregar un paquete o cambiar de versión:

```bash
deno cache supabase/functions/<funcion>/index.ts
```

Luego, en VS Code: `Ctrl+Shift+P` → **Deno: Restart Language Server**.

## Comandos útiles

```bash
# Frontend (Node)
npm install
npm run dev

# Funciones (Deno), desde la raíz del proyecto
deno cache supabase/functions/<funcion>/index.ts   # descargar dependencias
deno check supabase/functions/<funcion>/index.ts   # revisar tipos
cd supabase/functions && deno lint                 # lint
```
