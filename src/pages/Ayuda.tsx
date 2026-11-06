import { Tarjeta } from '../components/ui'

const PREGUNTAS = [
  {
    p: '¿Cómo se decide en qué mes se paga una compra?',
    r: 'Cada cliente tiene un día de corte y un día de pago. Las compras hechas hasta la fecha y hora de corte se pagan en la fecha de pago de ese mismo mes; las posteriores pasan al mes siguiente.',
  },
  {
    p: '¿Cómo se calculan los intereses de una compra a fin de mes?',
    r: 'Con la tasa pactada (nominal o efectiva) por los días transcurridos entre la fecha de compra y la fecha de pago: Interés = Capital × [(1 + TEP) − 1], donde TEP es la tasa efectiva del período de días. Año comercial de 360 días.',
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

export default function Ayuda() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ayuda y asistencia</h1>
      <p className="text-sm text-stone-600">
        En cada formulario, el ícono <span className="rounded-full bg-stone-200 px-1.5 text-xs font-bold">?</span> junto a cada campo
        explica qué ingresar.
      </p>
      <Tarjeta>
        <dl className="divide-y divide-stone-100">
          {PREGUNTAS.map((q) => (
            <div key={q.p} className="py-3">
              <dt className="font-medium">{q.p}</dt>
              <dd className="mt-1 text-sm text-stone-600">{q.r}</dd>
            </div>
          ))}
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Soporte técnico">
        <p className="text-sm text-stone-600">
          Si encuentras un error, anota qué estabas haciendo y la hora, y escríbele al administrador del sistema. Todas las operaciones
          quedan registradas en la auditoría, así que podemos revisar qué pasó.
        </p>
      </Tarjeta>
    </div>
  )
}
