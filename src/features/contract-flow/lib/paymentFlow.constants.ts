export const ENABLE_PAYMENT_METHOD_SELECTOR = false;

export type ContractNextStep =
  | "sign_contract"
  | "select_payment_method"
  | "pending_bank_transfer"
  | "completed";
