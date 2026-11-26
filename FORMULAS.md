# Fórmulas de CuentaVecina: dónde están, cómo se calculan y dónde se ven

Guía para la exposición. Cada fórmula aparece en tres lugares que siempre coinciden:

| Capa | Archivo | Para qué |
|---|---|---|
| **Base de datos: fórmulas** | `supabase/migrations/010_motor_financiero.sql` | **El archivo para mostrar.** Solo fórmulas: cada función recibe números y fechas y devuelve el resultado, sin validaciones ni tablas. |
| **Base de datos: uso** | `supabase/migrations/011_venta_y_cobranza.sql` | Vender, listar y cobrar llamando a esas fórmulas y **guardando** el resultado. Es la fuente oficial. Las validaciones están aparte (`fn_validar_venta`). |
| **Simulador (TypeScript)** | `src/lib/motorFinanciero.ts` | Muestra el resultado al instante en *Nueva venta*, antes de guardar. Tiene las pruebas unitarias. |
| **Pantallas** | `src/pages/…`, `src/components/…` | Solo muestran lo calculado; no tienen fórmulas propias. |
| **Ayuda en la app** | *Ayuda → Fórmulas del sistema* (`src/components/Formulas.tsx`) | Las mismas fórmulas, escritas para el usuario. |

> **Respuesta corta para el profe:** "Las fórmulas están en el motor financiero. En la base de datos, en `010_motor_financiero.sql`: una función por fórmula (`fn_tep`, `fn_ciclo_compra`, `fn_interes`, `fn_capitalizar`, `fn_cuota_exacta`, `fn_cuota_francesa`, `fn_cronograma_frances`). En el frontend, en `src/lib/motorFinanciero.ts`, con las mismas fórmulas y la misma numeración (§1 a §5). La base de datos es la oficial: al registrar una venta, `simular_venta` llama a esas funciones y guarda el resultado."

En VS Code, `Ctrl+Shift+O` dentro de `motorFinanciero.ts` lista las funciones. En Supabase, *Database → Functions* muestra cada función con su descripción (§1 … §6).

---

## Convenciones (Anexo A del enunciado)

| Regla | Dónde se aplica |
|---|---|
| Año comercial de **360** días y mes de **30** días | `DIAS_ANIO`, `DIAS_MES` (TS); `fn_dias_periodo` (SQL) |
| Tasas con precisión completa; se **muestran con 7 decimales** | `tasaPct` en `src/lib/formato.ts` |
| Montos redondeados a **2 decimales** | `r2` (TS); `round(…, 2)` (SQL) |
| Prelación: **mora → interés compensatorio → capital** | `estado_cuenta` y `registrar_pago` (SQL); línea "Imputación del pago" en pantalla |

Códigos de período (`periodo_tasa`, `capitalizacion`): 0 diaria (1 día), 1 quincenal (15), 2 mensual (30), 3 bimestral (60), 4 trimestral (90), 5 cuatrimestral (120), 6 semestral (180), 7 anual (360). Están en `PERIODOS` (`src/lib/codigos.ts`) y en `fn_dias_periodo` (SQL).

---

## Índice

| § | Fórmula | TypeScript | SQL | Se ve en | Prueba |
|---|---|---|---|---|---|
| 1 | TEP (efectiva y nominal) | `tasaEfectivaPeriodo` | `fn_tep` | Ticket de *Nueva venta* | "conversión de tasas" |
| 1 | TEA equivalente | `teaEquivalente` | `fn_tep(…, 360)` en `fn_validar_tasas_bcrp` | *Clientes* (al pactar la tasa) | "conversión de tasas" |
| 2 | Ciclo: fecha de corte y de pago | `determinarCiclo` | `fn_ciclo_compra`, `fn_fecha_corte` | Ticket, listado de pago | "ciclo de facturación", "pago al mes siguiente" |
| 3 | Compra a fin de mes: I = C · TEP | `simularFinDeMes` | `fn_interes` | Ticket, listado de pago | "Juego de datos 2" |
| 4 | Gracia total: C′ = C · (1 + TEP) | `simularCuotas` | `fn_capitalizar` | Ticket | "Juego de datos 1" |
| 4 | Cuota francesa R | `cuotaExacta`, `cuotaFrancesa` | `fn_cuota_exacta`, `fn_cuota_francesa` | Ticket | "cuota francesa igual" |
| 4 | Cronograma | `cronogramaFrances` | `fn_cronograma_frances` | Cronograma de *Nueva venta* | "Juego de datos 1" |
| 5 | Mora = Total · TEP_mora | `calcularMora` | `fn_interes` (en `estado_cuenta`) | *Cobranza*, *Mi cuenta* | "mora" |
| 5 | Listado de pago en la fecha de corte | — | `fn_generar_listados_corte` | Avisos (campana) | prueba SQL (ver §5) |
| 6 | Pago total y prelación | — | `registrar_pago` | *Cobranza* | — |

---

## §1 Tasa efectiva del período (TEP)

Toda tasa pactada (nominal o efectiva, de cualquier período) se convierte a la tasa efectiva para los días que se necesitan.

**Tasa efectiva** (TE del período de la tasa):

$$TEP = (1 + TE)^{\frac{\text{días}}{\text{período}}} - 1$$

**Tasa nominal** (TN capitalizable):

$$TEP = \left(1 + \frac{TN}{m}\right)^{n} - 1, \qquad m = \frac{\text{período}}{\text{capitalización}}, \qquad n = \frac{\text{días}}{\text{capitalización}}$$

- Con 0 días, TEP = 0 (no hay interés).
- **TEM** = TEP a 30 días; **TEA** = TEP a 360 días.

| Ejemplo | Cálculo | Resultado |
|---|---|---|
| TEA 30 % → TEM | $1.30^{30/360} - 1$ | 2.2104451 % |
| TNA 24 % cap. diaria → TEP 21 días | $(1 + 0.24/360)^{21} - 1$ | 1.4093729 % |
| TNA 24 % cap. diaria → TEA | $(1 + 0.24/360)^{360} - 1$ | 27.1147500 % |

**Dónde se ve:** en *Clientes*, debajo de la tasa aparece "Equivale a una TEA de …" (`CamposTasa.tsx`). Esa TEA se compara con el tope del BCRP vigente (`fn_validar_tasas_bcrp`). En el ticket de *Nueva venta* aparecen la TEP y la TEM con 7 decimales.

---

## §2 Ciclo de facturación: fecha de corte y fecha de pago

Reglas del enunciado (puntos 4 y 5), con la hora de corte de la tienda:

1. Si la compra es **hasta el día y la hora de corte**, entra al corte de ese mes. Si es **después**, pasa al corte del mes siguiente.
2. La **fecha de pago** es el día de pago del mismo mes del corte. Si el día de pago es **menor o igual** al de corte (por ejemplo, corte 10 y pago 5, como en una tarjeta), cae en el mes siguiente al corte.

| Compra | Corte / pago del cliente | Fecha de corte | Fecha de pago |
|---|---|---|---|
| 15/09 (ejemplo del enunciado) | 20 / 26 | 20/09 | 26/09 |
| 22/09 (después del corte) | 20 / 26 | 20/10 | 26/10 |
| 03/11 | 10 / 5 | 10/11 | 05/12 |
| 15/12 (después del corte) | 10 / 5 | 10/01 | 05/02 |

`fn_fecha_corte` hace el camino inverso (de la fecha de pago obtiene la fecha de corte). La usan el listado de pago y los avisos.

---

## §3 Compra a fin de mes (una sola armada)

$$\text{días} = \text{fecha de pago} - \text{fecha de compra}$$

$$I = C \times TEP(\text{días}) \qquad\qquad \text{Total} = C + I$$

**Ejemplo (Juego de datos 2):** C = S/ 350.50, TNA 24 % cap. diaria, compra 05/09, corte 20 y pago 26.
- Días = 26/09 − 05/09 = 21.
- TEP = 1.4093729 %.
- I = 350.50 × 0.014093729 = **S/ 4.94**.
- Total = **S/ 355.44**.

**Dónde se ve:** ticket de *Nueva venta* (días, TEP, interés y total) y listado de pago en *Cobranza* y *Mi cuenta* (columna "Días", capital, interés y total por compra).

---

## §4 Compra en cuotas: método francés vencido simple ordinario

**Paso 1. Gracia total** (enunciado, punto 4): desde la compra hasta la fecha de pago del ciclo no se paga nada y el interés se capitaliza.

$$C' = C \times \left(1 + TEP(d_g)\right), \qquad d_g = \text{fecha de pago} - \text{fecha de compra}$$

**Paso 2. Cuota constante** con la TEM (mes de 30 días):

$$TEM = TEP(30) \qquad\qquad R = \frac{C' \times TEM}{1 - (1 + TEM)^{-n}}$$

**Paso 3. Cronograma** (cuota k = 1 … n):

$$I_k = SI_k \times TEM \qquad A_k = R - I_k \qquad SI_{k+1} = SI_k - A_k$$

**Cuotas iguales al céntimo.** La R exacta casi nunca es un monto en céntimos, y si solo se redondea, el saldo final no cierra en 0. Por eso, en `cuotaFrancesa` / `fn_cuota_francesa` (con la ayuda de `fn_ajuste_ultima_cuota`):
- se prueban la R redondeada y sus vecinas (±1 céntimo, ±2…);
- se elige la que deja el menor ajuste en la última cuota;
- la última cuota amortiza el saldo exacto: $A_n = SI_n$ e $I_n = R - SI_n$.

Así **todas las cuotas valen lo mismo** y el saldo termina en 0. Las cuotas vencen el día de pago de los n meses siguientes.

**Ejemplo (Juego de datos 1, el del enunciado):** C = S/ 1 000, TEA 30 %, compra 15/09, corte 20, pago 26 y 3 cuotas.
- $d_g$ = 11 días (15/09 → 26/09).
- $TEP(11) = 1.30^{11/360} - 1$ = 0.8048906 %, así que C′ = **S/ 1 008.05**.
- TEM = 2.2104451 %.
- R exacta = 350.9798…, así que R = **S/ 350.98**.

| k | Vence | Saldo inicial | Interés | Amortización | Cuota | Saldo final |
|---|---|---|---|---|---|---|
| 1 | 26/10 | 1 008.05 | 22.28 | 328.70 | 350.98 | 679.35 |
| 2 | 26/11 | 679.35 | 15.02 | 335.96 | 350.98 | 343.39 |
| 3 | 26/12 | 343.39 | 7.59 | 343.39 | 350.98 | 0.00 |

Total a pagar: 3 × 350.98 = **S/ 1 052.94**.

**Dónde se ve:** ticket de *Nueva venta* (gracia total, TEP de gracia, capital capitalizado, TEM y valor de la cuota) y la tabla del cronograma (`Cronograma.tsx`). Cada cuota aparece en el listado del mes en que vence.

---

## §5 Listado de pago y mora

**Listado de un período** (`estado_cuenta`, enunciado, punto 6): incluye las compras a fin de mes y las cuotas de esa fecha de pago, **ordenadas por fecha y hora de compra**, con su capital, interés y total.

**Intereses por mora** (ítem aparte), si se paga después de la fecha de pago:

$$d_m = \text{fecha efectiva} - \text{fecha de pago} \qquad\qquad \text{Mora} = \text{Total} \times TEP_{mora}(d_m)$$

Se usa la **tasa moratoria pactada** (nominal o efectiva), aplicada al total que debió pagarse.

**Ejemplo:** Total S/ 1 000, TNA moratoria 12 % cap. diaria, 10 días de atraso.
- $TEP_{mora} = (1 + 0.12/360)^{10} - 1$ = 0.3338338 %.
- Mora = **S/ 3.34**.

**En la fecha de corte** (`fn_generar_listados_corte`, cada 15 minutos con `pg_cron`): al pasar la hora de corte de la tienda, se avisa a cada cliente con su listado (capital, intereses, total y fecha de pago) y a la tienda con el resumen del corte.

**Dónde se ve:** *Cobranza* (tienda) y *Mi cuenta* (cliente). El renglón rojo es "Intereses por mora" y debajo está la línea "Imputación del pago (prelación)".

---

## §6 Registro del pago

`registrar_pago` valida y guarda:
- Solo el administrador de la tienda del cliente puede registrarlo, y la fecha no puede ser futura.
- Los períodos se pagan **en orden** (primero el más antiguo).
- **Sin pagos parciales**: el monto debe ser exactamente el total de `estado_cuenta`.
- **Prelación**: mora → interés compensatorio → capital. Cada concepto se guarda en su columna de `pagos`.

---

## Flujo completo (para la demo)

1. **Nueva venta.** El navegador simula con `motorFinanciero.ts` y muestra el ticket y el cronograma. Al registrar, `registrar_venta` llama a `simular_venta`, que valida la venta (`fn_validar_venta`) y calcula con las fórmulas de `010` (`fn_ciclo_compra` → `fn_tep` → `fn_interes`, o `fn_capitalizar` → `fn_cuota_francesa` → `fn_cronograma_frances`). Se guardan la venta y sus cuotas, y un trigger valida el límite de crédito (deuda vigente + compra ≤ límite).
2. **Fecha de corte.** `fn_generar_listados_corte` avisa el listado de pago.
3. **Cobranza.** `estado_cuenta` arma el listado con la vista `v_deuda_pendiente` (compras y cuotas sin pagar) y agrega la mora con `fn_interes`; `registrar_pago` registra el pago total.

## Cómo se comprobó que TS y SQL coinciden

- `npm test`: 70 pruebas del motor TS, incluidos los Juegos de datos 1 y 2, cruces de mes y de año, y un barrido de 1 080 cronogramas (cuotas iguales y saldo 0).
- Comparación directa TS ↔ `simular_venta` en Supabase con los mismos datos de entrada (163 casos): los resultados son idénticos.
- Al simplificar el SQL (migraciones 010 y 011) se comparó la salida antes y después: `simular_venta` (174 casos y 60 errores esperados), `fn_cuota_francesa` (1 680 casos) y `estado_cuenta` (60 casos) son idénticas (mismo hash MD5). Además se registró una venta de prueba (y se deshizo): el cronograma guardado es igual al simulado y el trigger rechaza la venta que excede el límite.
