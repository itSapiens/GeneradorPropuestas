export type GenericRecord = Record<string, any>;

export interface FileBufferPayload {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface StoredDocumentPayload {
  bucket: string;
  fileName: string;
  folderPath: string;
  mimeType: string;
  path: string;
}

export interface ServerDependencies {
  env: {
    contractResumeJwtSecret: string;
    defaultSignalAmountEur: number;
    frontendUrl: string;
    gotenbergUrl: string;
    installationSearchRadiusMeters: number;
    port: number;
    sapiensBankAccountIban: string;
    sapiensContactEmail: string;
    sapiensContactPhone: string;
    stripeWebhookSecret: string;
  };
  repositories: {
    studies: {
      create(payload: GenericRecord): Promise<GenericRecord>;
      findById(id: string): Promise<GenericRecord | null>;
      update(id: string, payload: GenericRecord): Promise<GenericRecord>;
    };
    clients: {
      findByDni(params: {
        dni: string;
        empresaId?: string | null;
      }): Promise<GenericRecord | null>;
      findById(id: string): Promise<GenericRecord | null>;
      upsert(payload: GenericRecord): Promise<GenericRecord>;
    };
    installations: {
      findActive(): Promise<GenericRecord[]>;
      findById(id: string): Promise<GenericRecord | null>;
    };
    contracts: {
      create(payload: GenericRecord): Promise<GenericRecord>;
      findById(id: string): Promise<GenericRecord | null>;
      findByStudyId(studyId: string): Promise<GenericRecord | null>;
      update(id: string, payload: GenericRecord): Promise<GenericRecord>;
    };
    reservations: {
      createPendingReservation(payload: {
        clientId: string;
        contractId: string;
        installationId: string;
        notes: string;
        paymentDeadlineAt: string;
        reservedKwp: number;
        studyId: string;
      }): Promise<GenericRecord | null>;
      findByContractId(contractId: string): Promise<GenericRecord | null>;
      findById(id: string): Promise<GenericRecord | null>;
      releaseReservation(payload: {
        paymentStatus: string;
        reason: string;
        reservationId: string;
      }): Promise<void>;
      confirmPayment(payload: {
        reservationId: string;
        stripeCheckoutSessionId: string;
        stripePaymentIntentId?: string | null;
      }): Promise<void>;
      update(id: string, payload: GenericRecord): Promise<void>;
    };
    accessTokens: {
      create(payload: GenericRecord): Promise<void>;
      findProposalContinueByHash(tokenHash: string): Promise<GenericRecord | null>;
      revokeActiveProposalContinueTokens(payload: {
        clientId: string;
        studyId: string;
      }): Promise<void>;
    };
  };
  services: {
    documents: {
      downloadFileAsBuffer(payload: {
        bucket?: string | null;
        path: string;
      }): Promise<FileBufferPayload>;
      uploadClientDocument(payload: {
        apellidos: string;
        buffer: Buffer;
        dni: string;
        fileName: "factura.pdf" | "propuesta.pdf" | "contrato-firmado.pdf";
        mimeType: string;
        nombre: string;
      }): Promise<StoredDocumentPayload>;
    };
    drive: {
      downloadFileAsBuffer(fileId: string): Promise<FileBufferPayload>;
      ensureClientFolder(payload: {
        apellidos: string;
        dni: string;
        nombre: string;
      }): Promise<{
        id: string;
        name: string;
        webViewLink: string;
      }>;
      ensureContractsStatusFolder(status: "PendientesPago" | "Confirmados" | "Expirados"): Promise<{
        root: {
          id: string;
          name: string;
          webViewLink: string;
        };
        folder: {
          id: string;
          name: string;
          webViewLink: string;
        };
      }>;
      uploadBuffer(payload: {
        buffer: Buffer;
        fileName: string;
        folderId: string;
        mimeType: string;
      }): Promise<{
        id: string;
        name: string;
        webContentLink: string | null;
        webViewLink: string;
      }>;
    };
    extraction: {
      extractInvoiceWithFallback(payload: {
        buffer: Buffer;
        fileName: string;
        mimeType: string;
      }): Promise<any>;
    };
    geocoding: {
      geocodeAddress(address: string): Promise<{
        formattedAddress: string | null;
        lat: number;
        lng: number;
        placeId: string | null;
      } | null>;
      isGeocodeError(error: unknown): boolean;
      getGeocodeErrorResponse(error: unknown): {
        error: string;
        reason: string;
        status: number;
      } | null;
    };
    mail: {
      sendBankTransferReservationEmail(payload: GenericRecord): Promise<void>;
      sendProposalEmail(payload: GenericRecord): Promise<void>;
      sendReservationConfirmationAfterPayment(payload: {
        reservationId: string;
        stripePaymentIntentId?: string | null;
        stripeSessionId: string;
      }): Promise<void>;
    };
    pdf: {
      convertHtmlToPdf(payload: { html: string; waitForExpression?: string }): Promise<Buffer>;
    };
    stripe: {
      constructWebhookEvent(payload: {
        rawBody: Buffer;
        signature: string;
      }): any;
      createCheckoutSessionForReservation(payload: {
        clientEmail?: string | null;
        clientId: string;
        contractId: string;
        currency: string;
        installationId: string;
        installationName: string;
        paymentDeadlineAt?: string | null;
        reservationId: string;
        signalAmount: number;
        studyId: string;
      }): Promise<{
        id: string;
        payment_status: string | null;
        status: string | null;
        url: string | null;
        customer_email?: string | null;
        client_reference_id?: string | null;
        metadata?: Record<string, string>;
      }>;
      retrieveCheckoutSession(sessionId: string): Promise<any>;
    };
  };
}
