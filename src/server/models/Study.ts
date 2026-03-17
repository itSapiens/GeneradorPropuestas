import type { InstallationData, InstallationModalidad } from "./Installation";
import type { StoredDocumentData } from "./Document";

export type StudyStatus =
  | "uploaded"
  | "validated"
  | "location_selected"
  | "calculating"
  | "completed"
  | "error";

export type EmailStatus = "pending" | "sent" | "failed";

export type ClientType = "particular" | "empresa";
export type TariffType = "2TD" | "3TD";

export interface StudyCustomerData {
  clientType?: ClientType;
  name?: string;
  lastName?: string;
  dni?: string;
  cups?: string;
  address?: string;
  iban?: string;
  email?: string;
  phone?: string;
}

export interface StudyLocationData {
  address?: string;
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

export interface StudyInvoiceData {
  consumptionKwh?: number;
  averageMonthlyConsumptionKwh?: number;
  annualConsumptionKwh?: number;
  type?: TariffType;
  periods?: Record<string, unknown>;
  confidenceScore?: number;
  rawResult?: Record<string, unknown>;
  version?: string;
}

export interface StudyCalculationData {
  annualConsumptionKwh?: number;
  recommendedPowerKwp?: number;
  investmentCost?: number;
  serviceCost?: number;
  annualSavings?: number;
  formulaVersion?: string;
  modality?: InstallationModalidad;
}

export interface StudySelectionSnapshot {
  installationId?: string;
  installationName?: string;
  modalidad?: InstallationModalidad;
  installationData?: Partial<InstallationData>;
}

export interface StudyData {
  id?: string;
  language?: string;
  consent_accepted?: boolean;
  source_file?: StoredDocumentData | null;
  customer?: StudyCustomerData | null;
  location?: StudyLocationData | null;
  invoice_data?: StudyInvoiceData | null;
  selected_installation_id?: string | null;
  selected_installation_snapshot?: StudySelectionSnapshot | null;
  calculation?: StudyCalculationData | null;
  status?: StudyStatus;
  email_status?: EmailStatus;
  created_at?: string;
  updated_at?: string;
}