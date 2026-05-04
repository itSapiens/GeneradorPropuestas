export type CreateStudyPayload = {
  language?: string;
  consentAccepted?: boolean;
  customer?: Record<string, unknown>;
  location?: Record<string, unknown> | null;
  invoiceData?: Record<string, unknown> | null;
  calculation?: unknown;
};
