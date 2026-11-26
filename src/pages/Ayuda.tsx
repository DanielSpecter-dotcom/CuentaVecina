import { CircleHelp } from 'lucide-react'
import { Hoja, RenglonTitulo } from '../components/cuaderno'
import { Formulas } from '../components/Formulas'
import { Tarjeta } from '../components/ui'

// Copiadas en supabase/functions/asistente/index.ts (AYUDA): si cambian aquí, actualizar allá.
const PREGUNTAS = [
  {
    p: '¿Cómo se decide en qué mes se paga una compra?',
    r: 'Cada cliente tiene un día de corte y un día de pago. Las compras hechas hasta la fecha y hora de corte entran a ese corte; las posteriores pasan al corte del mes siguiente. El pago vence el día de pago del mismo mes del corte o, si el día de pago es menor o igual al de corte (p. ej. corte 10 y pago 5), en el mes siguiente. Al cerrarse el corte, el sistema genera el listado de pago de cada cliente y se lo avisa (también a la tienda).',
  },
  {
    p: '¿Cómo se calculan los intereses de una compra a fin de mes?',
    r: 'Con la tasa pactada (nominal o efectiva) por los días transcurridos entre la fecha de compra y la fecha de pago: Interés = Capital \u00d7 TEP, donde TEP es la tasa efectiva para esos días. Año comercial de 360 días.',
  },
  {
    p: '¿Cómo funcionan las compras en cuotas?',
    r: 'Método francés vencido simple ordinario (meses de 30 días). Desde la compra hasta la fecha de pago del ciclo hay un período de gracia total: esos intereses se capitalizan y luego se calcula la cuota constante. Las cuotas vencen en la fecha de pago de los meses siguientes.',
  },
  {
    p: '¿Qué pasa si el cliente paga tarde?',
    r: 'Se agrega un ítem de "Intereses por mora": la tasa moratoria pactada aplicada al total que debió pagarse, por los días de atraso. El pago se imputa en este orden: mora → interés compensatorio → capital.',
  },
  {
    p: '¿Se pueden hacer pagos parciales?',
    r: 'No. El sistema solo acepta el pago del total del período, y los períodos se pagan en orden (primero el más antiguo).',
  },
  {
    p: '¿Por qué una venta fue rechazada?',
    r: 'Porque la deuda vigente más la nueva compra supera el límite de crédito del cliente, o porque el número de cuotas excede su plazo máximo, o el producto no admite esa modalidad.',
  },
  {
    p: 'Olvidé mi contraseña',
    r: 'Los clientes deben pedirle a su tienda que la restablezca (Clientes → Restablecer contraseña). Los administradores de negocio, al administrador del sistema.',
  },
]

// Ruta para probar la app en vivo desde cero (también en docs/RUTA_DE_PRUEBA.md).
const RUTA = [
  { rol: 'Configuración inicial', pasos: ['En la pantalla de inicio de sesión, "Configurar CuentaVecina": se crea el administrador del sistema.'] },
  {
    rol: 'Administrador del sistema',
    pasos: [
      'Tiendas → "+ Alta de tienda" (o aprobar una solicitud de "Registra tu negocio").',
      'En la fila de la tienda → "+ crear administrador" con usuario y contraseña.',
      'Opcional: Administradores → crear otro administrador del sistema.',
    ],
  },
  {
    rol: 'Administrador del negocio',
    pasos: [
      'Productos → registrar al menos uno (precio al contado y de crédito).',
      'Clientes → registrar un cliente con su tasa, límite, día de corte y día de pago.',
      'Clientes → "+ crear usuario": el cliente entra con su DNI.',
      'Nueva venta → registrar una compra a fin de mes y otra en cuotas.',
      'Cobranza → elegir el período y "Registrar pago total".',
    ],
  },
  { rol: 'Cliente', pasos: ['Entra con su DNI: ve sus compras, cuotas y pagos, y en la campana de avisos, las compras y pagos registrados.'] },
]

const PREGUNTAS_AVISOS = [
  {
    p: '¿Qué avisos envía la app?',
    r: 'Al cliente: cada compra registrada, cada pago recibido, su listado de pago al cerrarse el corte, recordatorios 3 días antes, 1 día antes y el día de pago, y avisos de pago vencido. Al administrador del negocio: el resumen de cada corte cerrado y un resumen diario de lo que vence hoy y lo vencido. Los recordatorios se generan todos los días a las 8:00 a. m.',
  },
  {
    p: '¿Cómo recibo los avisos en el celular?',
    r: 'Toca la campana de avisos (arriba a la derecha) y luego "Recibir avisos en este dispositivo", y acepta el permiso. En iPhone primero instala la app: Compartir → Agregar a pantalla de inicio.',
  },
  {
    p: '¿Cómo instalo la app?',
    r: 'En Android o en la computadora (Chrome/Edge) aparece el botón "Instalar app". En iPhone: Compartir → Agregar a pantalla de inicio. Funciona igual que la versión web.',
  },
]

/** Preguntas en acordeón nativo (<details>): accesible con teclado y lector de pantalla sin JavaScript. */
function Preguntas({ lista }: { lista: { p: string; r: string }[] }) {
  return (
    <div className="divide-y divide-papel-borde border-y border-papel-borde">
      {lista.map((q) => (
        <details key={q.p} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-2 font-bold [&::-webkit-details-marker]:hidden">
            {q.p}
            <span aria-hidden="true" className="shrink-0 text-2xl leading-none transition group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="pb-4 text-sm leading-relaxed text-tinta-suave">{q.r}</p>
        </details>
      ))}
    </div>
  )
}

export default function Ayuda() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Ayuda y asistencia</h1>

      <Hoja>
        <RenglonTitulo titulo="Ruta de prueba" subtitulo="De cero a un pago registrado" />
        <ol>
          {RUTA.map((r, i) => (
            <li key={r.rol}>
              <p className="flex min-h-14 items-center">
                <span className="w-11 shrink-0 text-center font-display text-xl font-extrabold text-vencido">{i + 1}</span>
                <span className="pl-4 font-bold">{r.rol}</span>
              </p>
              <ul>
                {r.pasos.map((p) => (
                  <li key={p} className="flex min-h-14 items-center py-1.5 pr-4 pl-15 text-sm leading-7">
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Hoja>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Avisos y app en el celular</h2>
        <Preguntas lista={PREGUNTAS_AVISOS} />
      </section>

      <p className="text-sm text-tinta-suave">
        En cada formulario, el ícono{' '}
        <CircleHelp aria-label="de ayuda" className="inline size-4 align-text-bottom" /> junto a cada campo
        explica qué ingresar.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Preguntas frecuentes</h2>
        <Preguntas lista={PREGUNTAS} />
      </section>

      <section aria-labelledby="formulas" className="space-y-2">
        <h2 id="formulas" className="text-lg font-bold">
          Fórmulas del sistema
        </h2>
        <p className="text-sm text-tinta-suave">
          Año comercial de 360 días y mes de 30. Las tasas se calculan sin redondear (se muestran con 7 decimales) y los montos se
          redondean a 2 decimales.
        </p>
        <Formulas />
      </section>

      <Tarjeta titulo="Soporte técnico">
        <p className="text-sm text-tinta-suave">
          Si encuentras un error, anota qué estabas haciendo y la hora, y escríbele al administrador del sistema. Todas las operaciones
          quedan registradas en la auditoría, así que podemos revisar qué pasó.
        </p>
      </Tarjeta>
    </div>
  )
}
