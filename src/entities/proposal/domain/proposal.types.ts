import { CalculationResult } from "@/src/entities/proposal/application/calculateProposal.usecase";
import { BILL_TYPES } from "@/src/shared/lib/constants/proposal.constants";
import { ValidationBillDataSchema } from "@/src/entities/proposal/domain/proposal.rules";
import z from "zod";

export type Step = "upload" | "validation" | "map" | "calculation" | "result";

export type BillType = "2TD" | "3TD" | null;
export type ExtractionMethod = "ai" | "manual";

type NullableNumber = number | null;

interface PeriodValues {
  P1: NullableNumber;
  P2: NullableNumber;
  P3: NullableNumber;
  P4: NullableNumber;
  P5: NullableNumber;
  P6: NullableNumber;
}


export interface ApiInstallation {
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
  precio_excedentes_eur_kwh?: number;
  porcentaje_autoconsumo: number;
  modalidad: "inversion" | "servicio" | "ambas";
  active: boolean;
  created_at?: string;
  updated_at?: string;
  distance_meters?: number;

  contractable_kwp_total?: number;
  contractable_kwp_reserved?: number;
  contractable_kwp_confirmed?: number;

  total_contractable_kwp?: number;
  reserved_kwp?: number;
  confirmed_kwp?: number;
  unavailable_kwp?: number;
  available_kwp?: number;
  occupancy_percent?: number;

  calculo_estudios?: "segun_factura" | "fijo" | string | null;
  potencia_fija_kwp?: number | null;
  pago?: "segun_factura" | "fijo" | string | null;
  cantidad_precio_fijo?: number | null;
  reserva?: "segun_potencia" | "fija" | string | null;
  reserva_fija_eur?: number | null;
  iban_aportaciones?: string | null;
  empresa?: {
    id?: string | null;
    nombre?: string | null;
    cif?: string | null;
    email?: string | null;
    telefono?: string | null;
    representante_legal?: string | null;
  } | null;

  required_kwp?: number;
}
export type ProposalMode = "investment" | "service";
export type StudyComparisonResult = {
  investment: CalculationResult;
  service: CalculationResult;
};

export type ProposalCardData = {
  id: "investment" | "service";
  title: string;
  badge: string;
  annualSavings: number;
  totalSavings25Years: number;
  upfrontCost: number;
  monthlyFee: number | null;
  annualMaintenance: number;
  monthlyMaintenance: number | null;
  paybackYears: number;
  recommendedPowerKwp: number;
  annualConsumptionKwh: number;
  description: string;
  valuePoints: string[];
};
export type ContractPreviewData = {
  contractId: string;
  contractNumber: string;
  proposalMode: "investment" | "service";
  assignedKwp: number;
  commercial: {
    annualMaintenance: number;
    availableModes: ProposalMode[];
    investmentPrice: number | null;
    reservationAmount: number;
    reservationMode: "fija" | "segun_potencia";
    selectedMode: ProposalMode;
    selectedPrice: number | null;
    selectedPriceUnit: "one_time" | "monthly";
    serviceMonthlyFee: number | null;
  };
  client: {
    id: string;
    nombre: string;
    apellidos: string;
    dni: string;
    email?: string | null;
    telefono?: string | null;
  };
  installation: {
    id: string;
    nombre_instalacion: string;
    direccion: string;
    modalidad?: "inversion" | "servicio" | "ambas" | null;
    empresa?: {
      id?: string | null;
      nombre?: string | null;
      cif?: string | null;
      email?: string | null;
      telefono?: string | null;
      representante_legal?: string | null;
    } | null;
    iban_aportaciones?: string | null;
    potencia_instalada_kwp?: number | null;
    almacenamiento_kwh?: number | null;
    horas_efectivas?: number | null;
    porcentaje_autoconsumo?: number | null;
  };
};

export type GeneratedContractResponse = {
  success: boolean;
  contract: {
    id: string;
    status: string;
    proposal_mode: "investment" | "service";
    contract_number: string;
  };
  previewHtml: string;
  preview: ContractPreviewData;
};

export type PaymentMethodId = "stripe" | "bank_transfer";
export type ContractNextStep =
  | "sign_contract"
  | "select_payment_method"
  | "pending_bank_transfer"
  | "completed";

 export type PaymentMethodOption = {
  id: PaymentMethodId;
  label: string;
};

export type SignedContractResponse = {
  success: boolean;
  message: string;
  nextStep?: ContractNextStep;
  paymentFlowStatus?: string | null;
  paymentInstructionsSentAt?: string | null;
  lastPaymentInstructionsSentAt?: string | null;
  paymentInstructionsSentCount?: number;
  emailDeliveryStatus?: "sent" | "pending_retry";
  contract: any;
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    installationName: string;
    reservedKwp: number;
  };
  payment?: {
    step: "select_method";
    availableMethods: {
      id: "stripe" | "bank_transfer";
      label: string;
    }[];
  };
  bankTransfer?: {
    iban: string;
    beneficiary: string;
    concept: string;
    paymentDeadlineAt: string;
    emailSentTo: string | null;
    supportEmail: string;
  } | null;
  drive: {
    contractsRootFolderUrl: string | null;
    contractFolderUrl: string | null;
    contractFileUrl: string | null;
  };
  storage?: {
    bucket: string;
    contractPath: string;
    folderPath: string;
  };
};

export type StripePaymentResponse = {
  success: boolean;
  message: string;
  contract: {
    id: string;
    status: string;
    contractNumber: string;
  };
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    paymentMethod: "stripe";
  };
  stripe: {
    checkoutSessionId: string;
    checkoutUrl: string;
  };
};


export type BankTransferPaymentResponse = {
  success: boolean;
  message: string;
  nextStep?: ContractNextStep;
  paymentFlowStatus?: string | null;
  paymentInstructionsSentAt?: string | null;
  lastPaymentInstructionsSentAt?: string | null;
  paymentInstructionsSentCount?: number;
  emailDeliveryStatus?: "sent" | "pending_retry";
  contract: {
    id: string;
    status: string;
    contractNumber: string;
  };
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    paymentMethod: "bank_transfer";
  };
  bankTransfer: {
    iban: string;
    beneficiary: string;
    concept: string;
    paymentDeadlineAt: string;
    emailSentTo: string;
    supportEmail: string;
  };
};
export type AppLanguage = "es" | "ca" | "val" | "gl";

export interface ExtractedBillData {
  customer: {
    fullName: string | null;
    name: string | null;
    lastname1: string | null;
    lastname2: string | null;
    surnames: string | null;
    dni: string | null;
    cups: string | null;
    iban: string | null;
    ibanNeedsCompletion: boolean;
    email: string | null;
    phone: string | null;
  };
  location: {
    address: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
  };
  invoice_data: {
    type: BillType;
    billedDays: number | null;
    consumptionKwh: number | null;
    currentInvoiceConsumptionKwh: number | null;
    averageMonthlyConsumptionKwh: number | null;
    periods: PeriodValues;
    periodPricesEurPerKwh: PeriodValues;
    postcodeAverageConsumptionKwh: number | null;
    invoiceVariableEnergyAmountEur: number | null;
    invoiceTotalAmountEur: number | null;
    contractedPowerText: string | null;
    contractedPowerKw: number | null;
    contractedPowerP1: number | null;
    contractedPowerP2: number | null;
  };
  extraction: {
    confidenceScore: number | null;
    missingFields: string[];
    warnings: string[];
    manualReviewFields: string[];
    extractionMethod: ExtractionMethod;
    fallbackUsed: boolean;
  };
}

export type ValidationBillType = (typeof BILL_TYPES)[number];

export type ValidationBillDataFormInput = z.input<typeof ValidationBillDataSchema>;
export type ValidationBillData = z.output<typeof ValidationBillDataSchema>;



