//flag habilitar selector de pago
export const ENABLE_PAYMENT_METHOD_SELECTOR = false;

export type ContractNextStep =
  | "sign_contract"
  | "select_payment_method"
  | "pending_bank_transfer"
  | "completed";

function getMetadata(record: unknown): Record<string, any> {
  if (!record || typeof record !== "object") return {};

  const metadata = (record as Record<string, any>).metadata;
  if (!metadata || typeof metadata !== "object") return {};

  return metadata as Record<string, any>;
}

export function getContractPaymentMethod(contract: any, reservation: any) {
  return (
    reservation?.payment_method ??
    getMetadata(reservation).payment_method ??
    contract?.payment_method ??
    getMetadata(contract).payment_method ??
    null
  );
}

export function getContractPaymentFlowStatus(contract: any, reservation: any) {
  return (
    reservation?.payment_flow_status ??
    getMetadata(reservation).payment_flow_status ??
    contract?.payment_flow_status ??
    getMetadata(contract).payment_flow_status ??
    null
  );
}

export function getPaymentMethodSelectedAt(contract: any, reservation: any) {
  return (
    reservation?.payment_method_selected_at ??
    getMetadata(reservation).payment_method_selected_at ??
    contract?.payment_method_selected_at ??
    getMetadata(contract).payment_method_selected_at ??
    null
  );
}

export function getPaymentInstructionsSentAt(contract: any, reservation: any) {
  return (
    reservation?.payment_instructions_sent_at ??
    getMetadata(reservation).payment_instructions_sent_at ??
    contract?.payment_instructions_sent_at ??
    getMetadata(contract).payment_instructions_sent_at ??
    null
  );
}


export function getLastPaymentInstructionsSentAt(
  contract: any,
  reservation: any,
) {
  return (
    reservation?.last_payment_instructions_sent_at ??
    getMetadata(reservation).last_payment_instructions_sent_at ??
    contract?.last_payment_instructions_sent_at ??
    getMetadata(contract).last_payment_instructions_sent_at ??
    null
  );
}

export function getPaymentInstructionsSentCount(contract: any, reservation: any) {
  const raw =
    reservation?.payment_instructions_sent_count ??
    getMetadata(reservation).payment_instructions_sent_count ??
    contract?.payment_instructions_sent_count ??
    getMetadata(contract).payment_instructions_sent_count ??
    0;

  const count = Number(raw);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

//comprobar contrato ya firmado
export function hasContractBeenSigned(contract: any) {
  return Boolean(contract?.signed_at) || contract?.status === "signed";
}

export function isContractCompleted(contract: any, reservation: any) {
  const contractStatus = String(contract?.status ?? "")
    .trim()
    .toLowerCase();
  const reservationStatus = String(reservation?.reservation_status ?? "")
    .trim()
    .toLowerCase();
  const paymentStatus = String(reservation?.payment_status ?? "")
    .trim()
    .toLowerCase();
  const paymentFlowStatus = String(
    getContractPaymentFlowStatus(contract, reservation) ?? "",
  )
    .trim()
    .toLowerCase();

  return (
    contractStatus === "confirmed" ||
    paymentFlowStatus === "payment_confirmed" ||
    paymentStatus === "signal_paid" ||
    paymentStatus === "paid" ||
    reservationStatus === "confirmed"
  );
}
