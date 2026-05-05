export type InstallationModalidad = "inversion" | "servicio" | "ambas";

export interface InstallationData {
  id?: string;
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  horas_efectivas: number;
  potencia_instalada_kwp: number;
  almacenamiento_kwh: number;
  coste_anual_mantenimiento_por_kwp: number;
  coste_kwh_inversion: number;
  coste_kwh_servicio: number;
  pago?: "segun_factura" | "fijo" | string | null;
  cantidad_precio_fijo?: number | null;
  porcentaje_autoconsumo: number;
  modalidad: InstallationModalidad;
  active?: boolean;
  created_at?: string;
  updated_at?: string;

  // Campo calculado opcional cuando la API devuelve instalaciones cercanas
  distance_meters?: number;
}
