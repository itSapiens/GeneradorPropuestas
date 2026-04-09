export type InstallationModalidad = 'inversion' | 'servicio' | 'ambas';
export type StudyStatus =
  | 'uploaded'
  | 'validated'
  | 'location_selected'
  | 'calculating'
  | 'completed'
  | 'error';

export type EmailStatus = 'pending' | 'sent' | 'failed';

export interface InstallationRow {
  id: string;
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
  porcentaje_autoconsumo: number;
  modalidad: InstallationModalidad;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudyRow {
  id: string;
  language: string | null;
  consent_accepted: boolean | null;
  source_file: Record<string, unknown> | null;
  customer: Record<string, unknown> | null;
  location: Record<string, unknown> | null;
  invoice_data: Record<string, unknown> | null;
  selected_installation_id: string | null;
  selected_installation_snapshot: Record<string, unknown> | null;
  calculation: Record<string, unknown> | null;
  status: StudyStatus | null;
  email_status: EmailStatus | null;
  created_at: string;
  updated_at: string;
}