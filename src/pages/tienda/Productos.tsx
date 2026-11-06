import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alerta, Boton, Campo, Etiqueta, Modal, Tarjeta, Vacio } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { MODALIDADES_PRODUCTO } from '../../lib/codigos'
import { dinero } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import type { Producto } from '../../types'

const vacio = {
  nombre: '',
  descripcion: '',
  marca: '',
  proveedor: '',
  unidad_medida: 'Unidad',
  precio_contado: '',
  precio_lista: '',
  modalidad_venta: 2,
  imagen_url: '' as string | null,
}
type Form = typeof vacio & { id?: string }

export default function Productos() {
  const { tienda } = useAuth()
  const [lista, setLista] = useState<Producto[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [filtro, setFiltro] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('productos').select('*').order('nombre')
    if (error) setError(mensajeError(error))
    setLista((data as Producto[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!form || !tienda) return
    setError(null)
    if (Number(form.precio_lista) < Number(form.precio_contado)) {
      return setError('El precio de lista (crédito) no puede ser menor que el precio al contado')
    }
    setGuardando(true)
    try {
      let imagen_url = form.imagen_url || null
      if (archivo) {
        const ext = archivo.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const ruta = `${tienda.id}/${crypto.randomUUID()}.${ext}`
        const { error: eSubida } = await supabase.storage.from('productos').upload(ruta, archivo, { contentType: archivo.type })
        if (eSubida) throw eSubida
        imagen_url = supabase.storage.from('productos').getPublicUrl(ruta).data.publicUrl
      }
      const fila = {
        tienda_id: tienda.id,
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        marca: form.marca || null,
        proveedor: form.proveedor || null,
        unidad_medida: form.unidad_medida,
        precio_contado: Number(form.precio_contado),
        precio_lista: Number(form.precio_lista),
        modalidad_venta: Number(form.modalidad_venta),
        imagen_url,
      }
      const r = form.id ? await supabase.from('productos').update(fila).eq('id', form.id) : await supabase.from('productos').insert(fila)
      if (r.error) throw r.error
      setForm(null)
      setArchivo(null)
      cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(p: Producto) {
    const { error } = await supabase.from('productos').update({ estado: !p.estado }).eq('id', p.id)
    if (error) setError(mensajeError(error))
    else cargar()
  }

  const visibles = lista.filter((p) => `${p.nombre} ${p.marca ?? ''}`.toLowerCase().includes(filtro.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Productos y servicios</h1>
        <div className="flex gap-2">
          <input placeholder="Buscar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          <Boton onClick={() => setForm({ ...vacio })}>+ Nuevo</Boton>
        </div>
      </div>
      {error && !form && <Alerta>{error}</Alerta>}
      <Tarjeta>
        {visibles.length === 0 ? (
          <Vacio>Aún no hay productos. Agrega el primero.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th className="text-right">Contado</th>
                  <th className="text-right">Crédito (lista)</th>
                  <th>Modalidad</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id} className={p.estado ? '' : 'opacity-60'}>
                    <td className="w-14">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt={p.nombre} className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-stone-100" />
                      )}
                    </td>
                    <td>
                      <div className="font-medium">{p.nombre}</div>
                      <div className="text-xs text-stone-500">{[p.marca, p.proveedor].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>{p.unidad_medida}</td>
                    <td className="text-right">{dinero(p.precio_contado)}</td>
                    <td className="text-right font-medium">{dinero(p.precio_lista)}</td>
                    <td className="text-xs">{MODALIDADES_PRODUCTO[p.modalidad_venta]?.nombre}</td>
                    <td>{p.estado ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>}</td>
                    <td className="space-x-1 text-right whitespace-nowrap">
                      <Boton
                        variante="fantasma"
                        onClick={() =>
                          setForm({
                            id: p.id,
                            nombre: p.nombre,
                            descripcion: p.descripcion ?? '',
                            marca: p.marca ?? '',
                            proveedor: p.proveedor ?? '',
                            unidad_medida: p.unidad_medida,
                            precio_contado: String(p.precio_contado),
                            precio_lista: String(p.precio_lista),
                            modalidad_venta: p.modalidad_venta,
                            imagen_url: p.imagen_url,
                          })
                        }
                      >
                        Editar
                      </Boton>
                      <Boton variante="secundario" onClick={() => cambiarEstado(p)}>
                        {p.estado ? 'Dar de baja' : 'Activar'}
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal titulo={form?.id ? 'Editar producto' : 'Nuevo producto o servicio'} abierto={!!form} onCerrar={() => setForm(null)}>
        {form && (
          <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
            {error && (
              <div className="sm:col-span-2">
                <Alerta>{error}</Alerta>
              </div>
            )}
            <Campo etiqueta="Nombre" ayuda="Nombre del producto o servicio (p. ej. 'Arroz Costeño 5 kg' o 'Corte de cabello').">
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required maxLength={100} />
            </Campo>
            <Campo etiqueta="Unidad de medida" ayuda="Unidad, kg, litro, paquete, servicio…">
              <input value={form.unidad_medida} onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })} required maxLength={20} />
            </Campo>
            <Campo etiqueta="Marca" ayuda="Opcional.">
              <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} maxLength={50} />
            </Campo>
            <Campo etiqueta="Proveedor" ayuda="Opcional: a quién le compras este producto.">
              <input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} maxLength={100} />
            </Campo>
            <Campo etiqueta="Descripción" ayuda="Detalle adicional (opcional)." className="sm:col-span-2">
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} maxLength={250} />
            </Campo>
            <Campo etiqueta="Precio al contado (S/)" ayuda="Precio si el cliente paga en el momento.">
              <input type="number" step="0.01" min="0.01" value={form.precio_contado} onChange={(e) => setForm({ ...form, precio_contado: e.target.value })} required />
            </Campo>
            <Campo etiqueta="Precio de lista — crédito (S/)" ayuda="Precio que se usa en las ventas a crédito. Debe ser mayor o igual al precio al contado.">
              <input type="number" step="0.01" min="0.01" value={form.precio_lista} onChange={(e) => setForm({ ...form, precio_lista: e.target.value })} required />
            </Campo>
            <Campo etiqueta="Modalidad de venta a crédito" ayuda="Si se puede vender para pagar en una sola armada a fin de mes (fecha de pago), en cuotas mensuales, o de ambas formas.">
              <select value={form.modalidad_venta} onChange={(e) => setForm({ ...form, modalidad_venta: Number(e.target.value) })}>
                {MODALIDADES_PRODUCTO.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Imagen" ayuda="PNG, JPG o WEBP de hasta 2 MB.">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            </Campo>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Boton type="button" variante="secundario" onClick={() => setForm(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={guardando}>
                Guardar
              </Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
