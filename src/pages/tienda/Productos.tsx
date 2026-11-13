import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
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
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((x) => x && { ...x, [k]: e.target.value })

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('productos').select('*').order('nombre')
    if (error) setError(mensajeError(error))
    setLista((data as Producto[]) ?? [])
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function guardar(e: SubmitEvent) {
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
        <h1 className="text-2xl font-bold sm:text-3xl">Productos y servicios</h1>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            type="search"
            aria-label="Buscar producto por nombre o marca"
            placeholder="Buscar por nombre o marca…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="min-w-0 flex-1"
          />
          <Boton onClick={() => setForm({ ...vacio })}>+ Nuevo producto</Boton>
        </div>
      </div>
      {error && !form && <Alerta>{error}</Alerta>}
      <Tarjeta>
        {visibles.length === 0 ? (
          <Vacio>{lista.length ? `Ningún producto coincide con "${filtro}".` : 'Aún no hay productos. Agrega el primero con "+ Nuevo producto".'}</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th><span className="sr-only">Imagen</span></th>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th className="text-right">Contado</th>
                  <th className="text-right">Crédito (lista)</th>
                  <th>Modalidad</th>
                  <th>Estado</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id} className={p.estado ? '' : 'bg-stone-50'}>
                    <td className="w-14">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-stone-100" />
                      )}
                    </td>
                    <td>
                      <div className="font-medium">{p.nombre}</div>
                      <div className="text-xs text-stone-600">{[p.marca, p.proveedor].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td>{p.unidad_medida}</td>
                    <td className="text-right">{dinero(p.precio_contado)}</td>
                    <td className="text-right font-medium">{dinero(p.precio_lista)}</td>
                    <td className="text-xs">{MODALIDADES_PRODUCTO[p.modalidad_venta]?.nombre}</td>
                    <td>{p.estado ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>}</td>
                    <td className="space-x-1 text-right whitespace-nowrap">
                      <Boton
                        variante="fantasma"
                        aria-label={`Editar ${p.nombre}`}
                        onClick={() =>
                          setForm({ ...p, descripcion: p.descripcion ?? '', marca: p.marca ?? '', proveedor: p.proveedor ?? '', precio_contado: String(p.precio_contado), precio_lista: String(p.precio_lista) })
                        }
                      >
                        Editar
                      </Boton>
                      <Boton variante="secundario" aria-label={`${p.estado ? 'Dar de baja' : 'Activar'} ${p.nombre}`} onClick={() => cambiarEstado(p)}>
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
              <input value={form.nombre} onChange={set('nombre')} required maxLength={100} />
            </Campo>
            <Campo etiqueta="Unidad de medida" ayuda="Unidad, kg, litro, paquete, servicio…">
              <input value={form.unidad_medida} onChange={set('unidad_medida')} required maxLength={20} />
            </Campo>
            <Campo etiqueta="Marca" opcional ayuda="Marca del producto, si tiene.">
              <input value={form.marca} onChange={set('marca')} maxLength={50} />
            </Campo>
            <Campo etiqueta="Proveedor" opcional ayuda="A quién le compras este producto.">
              <input value={form.proveedor} onChange={set('proveedor')} maxLength={100} />
            </Campo>
            <Campo etiqueta="Descripción" opcional ayuda="Detalle adicional." className="sm:col-span-2">
              <input value={form.descripcion} onChange={set('descripcion')} maxLength={250} />
            </Campo>
            <Campo etiqueta="Precio al contado (S/)" ayuda="Precio si el cliente paga en el momento.">
              <input type="number" step="0.01" min="0.01" value={form.precio_contado} onChange={set('precio_contado')} required />
            </Campo>
            <Campo etiqueta="Precio de lista — crédito (S/)" ayuda="Precio que se usa en las ventas a crédito. Debe ser mayor o igual al precio al contado.">
              <input type="number" step="0.01" min="0.01" value={form.precio_lista} onChange={set('precio_lista')} required />
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
            <Campo etiqueta="Imagen" opcional ayuda="PNG, JPG o WEBP de hasta 2 MB. Si no eliges otra, se conserva la actual.">
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
