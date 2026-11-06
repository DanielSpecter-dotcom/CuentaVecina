// Tipos de las tablas que usa el frontend (subset del esquema de Supabase).

export type Rol = 'admin_sistema' | 'admin_tienda' | 'cliente'

export interface Perfil {
  id: string
  rol: Rol
  tienda_id: string | null
  cliente_id: string | null
  nombre: string | null
  usuario: string | null
  activo: boolean
}

export interface Tienda {
  id: string
  nombre_comercial: string
  ruc: string
  giro: string
  direccion: string
  telefono: string | null
  correo: string | null
  estado: boolean
  hora_corte: string
  created_at: string
}

export interface Producto {
  id: string
  tienda_id: string
  nombre: string
  descripcion: string | null
  proveedor: string | null
  marca: string | null
  unidad_medida: string
  imagen_url: string | null
  precio_contado: number
  precio_lista: number
  modalidad_venta: number
  estado: boolean
}

export interface Cliente {
  id: string
  tienda_id: string
  nombre: string
  documento: string
  telefono: string | null
  correo: string | null
  direccion: string | null
  moneda: boolean
  tipo_tasa: boolean
  tasa_compensatoria: number
  periodo_tasa: number
  capitalizacion: number | null
  tasa_moratoria: number
  tipo_tasa_moratoria: boolean
  periodo_tasa_moratoria: number
  capitalizacion_moratoria: number | null
  limite_credito: number
  plazo_max_meses: number
  dia_corte: number
  dia_pago: number
  estado: boolean
}

export interface Venta {
  id: string
  cliente_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number | null
  fecha_compra: string
  fecha_hora_compra: string
  modalidad_pago: boolean
  num_cuotas: number | null
  monto_capital: number
  interes_compensatorio: number
  capital_capitalizado: number | null
  valor_cuota: number | null
  fecha_pago_pactada: string
  traslado_periodo: boolean
  estado_pago: 'pendiente' | 'pagado'
  productos?: { nombre: string } | null
}

export interface Cuota {
  id: string
  venta_id: string
  numero_cuota: number
  fecha_vencimiento: string
  saldo_inicial: number
  interes: number
  amortizacion: number
  cuota: number
  saldo_final: number
  estado_pago: 'pendiente' | 'pagado'
}

export interface Pago {
  id: string
  cliente_id: string
  monto_pagado: number
  fecha_efectiva_pago: string
  fecha_vencimiento: string | null
  fecha_corte_periodo: string
  dias_mora: number
  interes_moratorio: number
  interes_compensatorio: number
  capital: number
  created_at: string
}

export interface PeriodoPendiente {
  fecha_pago: string
  fecha_corte: string
  items: number
  capital: number
  interes: number
  total: number
}

export interface ItemEstadoCuenta {
  venta_id: string
  cuota_id: string | null
  tipo: 'COMPRA' | 'CUOTA'
  fecha_compra: string
  descripcion: string
  dias: number | null
  capital: number
  interes: number
  total: number
}

export interface EstadoCuenta {
  clienteId: string
  cliente: string
  documento: string
  moneda: 'PEN' | 'USD'
  fechaCorte: string
  fechaPago: string
  fechaEfectiva: string
  diasMora: number
  items: ItemEstadoCuenta[]
  capital: number
  interesCompensatorio: number
  interesMoratorio: number
  total: number
}
