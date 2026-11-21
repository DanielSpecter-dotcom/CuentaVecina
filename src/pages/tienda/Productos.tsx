import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { Segmentado } from '../../components/cuaderno'
import { Alerta, Boton, Campo, Etiqueta, Modal, PieModal, Tarjeta, Vacio } from '../../components/ui'
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

  const editar = (p: Producto) =>
    setForm({ ...p, descripcion: p.descripcion ?? '', marca: p.marca ?? '', proveedor: p.proveedor ?? '', precio_contado: String(p.precio_contado), precio_lista: String(p.precio_lista) })
  const estadoDe = (p: Producto) => (p.estado ? <Etiqueta color="verde">Activo</Etiqueta> : <Etiqueta color="rojo">De baja</Etiqueta>)
  const imagen = (p: Producto, clase: string) =>
    p.imagen_url ? <img src={p.imagen_url} alt="" className={`${clase} shrink-0 rounded-lg object-cover`} /> : <div className={`${clase} shrink-0 rounded-lg bg-papel-borde`} />

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Productos y servicios</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Buscar producto por nombre o marca"
          placeholder="Buscar por nombre o marca…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="w-full min-w-0 sm:flex-1"
        />
        <Boton onClick={() => setForm({ ...vacio })} className="w-full sm:w-auto">
          + Nuevo producto
        </Boton>
      </div>
      {error && !form && <Alerta>{error}</Alerta>}

      {visibles.length === 0 ? (
        <Vacio>{lista.length ? `Ningún producto coincide con "${filtro}".` : 'Aún no hay productos. Agrega el primero con "+ Nuevo producto".'}</Vacio>
      ) : (
        <>
          {/* Celular: una ficha por producto. */}
          <ul className="space-y-3 sm:hidden">
            {visibles.map((p) => (
              <li key={p.id} className={`rounded-2xl border border-papel-borde p-4 ${p.estado ? 'bg-white' : 'bg-papel-borde/40'}`}>
                <div className="flex items-start gap-3">
                  {imagen(p, 'h-14 w-14')}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{p.nombre}</p>
                    {(p.marca || p.proveedor) && <p className="truncate text-xs text-tinta-suave">{[p.marca, p.proveedor].filter(Boolean).join(' · ')}</p>}
                    <p className="mt-1 tabular-nums">
                      <span className="font-bold">{dinero(p.precio_lista)}</span>{' '}
                      <span className="text-sm text-tinta-suave">contado {dinero(p.precio_contado)}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Etiqueta>{MODALIDADES_PRODUCTO[p.modalidad_venta]?.nombre}</Etiqueta>
                  {estadoDe(p)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Boton variante="fantasma" aria-label={`Editar ${p.nombre}`} onClick={() => editar(p)}>
                    Editar
                  </Boton>
                  <Boton variante="secundario" aria-label={`${p.estado ? 'Dar de baja' : 'Activar'} ${p.nombre}`} onClick={() => cambiarEstado(p)}>
                    {p.estado ? 'Dar de baja' : 'Activar'}
                  </Boton>
                </div>
              </li>
            ))}
          </ul>

          <Tarjeta className="hidden sm:block">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>
                      <span className="sr-only">Imagen</span>
                    </th>
                    <th>Producto</th>
                    <th>Unidad</th>
                    <th className="text-right">Contado</th>
                    <th className="text-right">Crédito (lista)</th>
                    <th>Modalidad</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.id} className={p.estado ? '' : 'bg-papel-borde/40'}>
                      <td className="w-14">{imagen(p, 'h-10 w-10')}</td>
                      <td>
                        <div className="font-bold">{p.nombre}</div>
                        <div className="text-xs text-tinta-suave">{[p.marca, p.proveedor].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td>{p.unidad_medida}</td>
                      <td className="text-right text-tinta-suave">{dinero(p.precio_contado)}</td>
                      <td className="text-right font-bold">{dinero(p.precio_lista)}</td>
                      <td className="text-xs">{MODALIDADES_PRODUCTO[p.modalidad_venta]?.nombre}</td>
                      <td>{estadoDe(p)}</td>
                      <td className="space-x-1 text-right whitespace-nowrap">
                        <Boton variante="fantasma" aria-label={`Editar ${p.nombre}`} onClick={() => editar(p)}>
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
          </Tarjeta>
        </>
      )}

      <Modal titulo={form?.id ? 'Editar producto' : 'Nuevo producto o servicio'} abierto={!!form} onCerrar={() => setForm(null)}>
        {form && (
          <form onSubmit={guardar} className="space-y-4">
            {error && <Alerta>{error}</Alerta>}
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Campo
                etiqueta="Modalidad de venta a crédito"
                ayuda="Si se puede vender para pagar en una sola armada a fin de mes (fecha de pago), en cuotas mensuales, o de ambas formas."
                className="sm:col-span-2"
              >
                <Segmentado
                  etiqueta="Modalidad de venta a crédito"
                  valor={Number(form.modalidad_venta)}
                  onChange={(v) => setForm({ ...form, modalidad_venta: v })}
                  opciones={MODALIDADES_PRODUCTO.map((m) => ({ valor: m.codigo as number, titulo: m.nombre }))}
                />
              </Campo>
              <Campo etiqueta="Imagen" opcional ayuda="PNG, JPG o WEBP de hasta 2 MB. Si no eliges otra, se conserva la actual." className="sm:col-span-2">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              </Campo>
            </div>
            <PieModal>
              <Boton type="button" variante="secundario" onClick={() => setForm(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" cargando={guardando}>
                Guardar
              </Boton>
            </PieModal>
          </form>
        )}
      </Modal>
    </div>
  )
}
