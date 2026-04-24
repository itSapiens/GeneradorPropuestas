import type { ServerDependencies } from "../application/ports/serverDependencies";
import {
  CONTRACT_RESUME_JWT_SECRET,
  DEFAULT_SIGNAL_AMOUNT_EUR,
  FRONTEND_URL,
  INSTALLATION_SEARCH_RADIUS_METERS,
  PORT,
  SAPIENS_BANK_ACCOUNT_IBAN,
  SAPIENS_CONTACT_EMAIL,
  SAPIENS_CONTACT_PHONE,
  STRIPE_WEBHOOK_SECRET,
} from "./config/env";
import { serverRepositories } from "./persistence/supabase/serverRepositories";
import {
  downloadDriveFileAsBuffer,
  ensureClientDriveFolder,
  ensureContractsStatusFolder,
  uploadBufferToDrive,
} from "./external/drive/driveStorageService";
import {
  downloadSupabaseDocumentAsBuffer,
  uploadClientDocumentToSupabase,
} from "./external/storage/supabaseDocumentStorageService";
import { extractInvoiceWithFallback } from "./external/extraction/invoiceExtractionOrchestrator";
import {
  GeocodeError,
  geocodeAddressWithGoogle,
} from "./external/geocoding/geocodingService";
import {
  sendBankTransferReservationEmail,
  sendProposalEmail,
} from "../../services/mailer.service";
import { sendReservationConfirmationAfterPayment } from "./external/payments/reservationConfirmationService";
import { createCheckoutSessionForReservation } from "./external/payments/reservationCheckoutService";
import { stripe } from "./clients/stripeClient";

export function createServerDependencies(): ServerDependencies {
  return {
    env: {
      contractResumeJwtSecret: CONTRACT_RESUME_JWT_SECRET,
      defaultSignalAmountEur: DEFAULT_SIGNAL_AMOUNT_EUR,
      frontendUrl: FRONTEND_URL,
      installationSearchRadiusMeters: INSTALLATION_SEARCH_RADIUS_METERS,
      port: PORT,
      sapiensBankAccountIban: SAPIENS_BANK_ACCOUNT_IBAN,
      sapiensContactEmail: SAPIENS_CONTACT_EMAIL,
      sapiensContactPhone: SAPIENS_CONTACT_PHONE,
      stripeWebhookSecret: STRIPE_WEBHOOK_SECRET,
    },
    repositories: serverRepositories,
    services: {
      documents: {
        downloadFileAsBuffer: downloadSupabaseDocumentAsBuffer,
        uploadClientDocument: uploadClientDocumentToSupabase,
      },
      drive: {
        downloadFileAsBuffer: downloadDriveFileAsBuffer,
        ensureClientFolder: ensureClientDriveFolder,
        ensureContractsStatusFolder,
        uploadBuffer: uploadBufferToDrive,
      },
      extraction: {
        extractInvoiceWithFallback,
      },
      geocoding: {
        async geocodeAddress(address: string) {
          return geocodeAddressWithGoogle(address);
        },
        getGeocodeErrorResponse(error: unknown) {
          if (!(error instanceof GeocodeError)) {
            return null;
          }

          return {
            error: error.message,
            reason: error.reason,
            status: error.status,
          };
        },
        isGeocodeError(error: unknown) {
          return error instanceof GeocodeError;
        },
      },
      mail: {
        sendBankTransferReservationEmail,
        sendProposalEmail,
        sendReservationConfirmationAfterPayment,
      },
      stripe: {
        constructWebhookEvent(payload: { rawBody: Buffer; signature: string }) {
          return stripe.webhooks.constructEvent(
            payload.rawBody,
            payload.signature,
            STRIPE_WEBHOOK_SECRET,
          );
        },
        createCheckoutSessionForReservation,
        retrieveCheckoutSession(sessionId: string) {
          return stripe.checkout.sessions.retrieve(sessionId);
        },
      },
    },
  };
}
