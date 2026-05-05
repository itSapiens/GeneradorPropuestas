import type { ServerDependencies } from "../ports/serverDependencies";

import {
  normalizeDni,
  normalizeIdentityText,
  sha256,
  signContractResumeToken,
  verifyContractResumeToken,
} from "../../domain/contracts/contractAccess";
import {
  getAllowedProposalModes,
  normalizeAppLanguage,
  resolveProposalMode,
} from "../../domain/contracts/contractLocalization";
import {
  ENABLE_PAYMENT_METHOD_SELECTOR,
  getContractPaymentFlowStatus,
  getContractPaymentMethod,
  getLastPaymentInstructionsSentAt,
  getPaymentInstructionsSentAt,
  getPaymentInstructionsSentCount,
  getPaymentMethodSelectedAt,
  hasContractBeenSigned,
  isContractCompleted,
  type ContractNextStep,
} from "../../domain/contracts/paymentFlow";
import { buildContractCommercialSummary } from "../../domain/contracts/contractCommercial";
import { buildBasicContractHtml } from "../../domain/contracts/contractHtml";
import { buildSignedContractPdfHtml } from "../../domain/contracts/signedContractPdfHtml";
import {
  resolveInstallationBankBeneficiary,
  resolveInstallationBankIban,
  resolveInstallationContactEmail,
  resolveReservationAmountForInstallation,
} from "../../domain/installations/installationPolicy";
import {
  badRequest,
  conflict,
  gone,
  internalServerError,
  notFound,
  unauthorized,
} from "../../shared/http/httpError";
import { getContractContextFromStudy } from "../services/contractContextService";
import { buildContractNumber } from "../../infrastructure/external/drive/driveStorageService";
import { toPositiveNumber } from "../../utils/parsingUtils";

export async function renderSignedContractPdfUseCase(
  deps: ServerDependencies,
  payload: {
    language?: string | null;
    preview: any;
    signatureDataUrl?: string | null;
  },
): Promise<Buffer> {
  if (!payload.preview || !payload.signatureDataUrl) {
    throw badRequest("Faltan datos para generar el PDF firmado");
  }

  const language = normalizeAppLanguage(payload.language);
  const html = buildSignedContractPdfHtml({
    language,
    preview: payload.preview,
    signatureDataUrl: payload.signatureDataUrl,
  });

  return deps.services.pdf.convertHtmlToPdf({ html });
}

async function getProposalAccessContext(
  deps: ServerDependencies,
  token: string,
) {
  const tokenHash = sha256(token);
  const accessToken = await deps.repositories.accessTokens.findProposalContinueByHash(
    tokenHash,
  );

  if (!accessToken) {
    throw notFound("Enlace no válido");
  }

  if (
    accessToken.expires_at &&
    new Date(accessToken.expires_at).getTime() < Date.now()
  ) {
    throw gone("El enlace ha caducado");
  }

  const study = await deps.repositories.studies.findById(accessToken.study_id);

  if (!study) {
    throw notFound("No se encontró el estudio asociado", "Estudio no encontrado");
  }

  if (!study.selected_installation_id) {
    throw badRequest("El estudio no tiene instalación asociada");
  }

  const installation = await deps.repositories.installations.findById(
    study.selected_installation_id,
  );

  if (!installation) {
    throw notFound(
      "No se encontró la instalación asociada al estudio",
      "Instalación no encontrada",
    );
  }

  return { accessToken, installation, study };
}

async function getOrCreateGeneratedContract(
  deps: ServerDependencies,
  params: {
    assignedKwp: number;
    clientId: string;
    empresaId?: string | null;
    installationId: string;
    proposalMode: "investment" | "service";
    source: "access" | "study";
    study: any;
  },
) {
  let contract = await deps.repositories.contracts.findByStudyId(params.study.id);

  if (
    contract &&
    contract.status === "generated" &&
    !contract.signed_at &&
    !contract.uploaded_at &&
    contract.proposal_mode !== params.proposalMode
  ) {
    contract = await deps.repositories.contracts.update(contract.id, {
      metadata: {
        ...(contract.metadata ?? {}),
        assigned_kwp: params.assignedKwp,
        [`proposal_mode_updated_from_${params.source}`]: true,
        proposal_mode_updated_at: new Date().toISOString(),
      },
      proposal_mode: params.proposalMode,
    });
  }

  if (contract) {
    return contract;
  }

  try {
    return await deps.repositories.contracts.create({
      client_id: params.clientId,
      contract_number: buildContractNumber(params.study.id),
      empresa_id: params.empresaId ?? null,
      installation_id: params.installationId,
      metadata: {
        assigned_kwp: params.assignedKwp,
        created_from_resume_access: params.source === "access",
        study_created_at: params.study.created_at,
      },
      proposal_mode: params.proposalMode,
      signature_type: "simple",
      status: "generated",
      study_id: params.study.id,
    });
  } catch (error: any) {
    const isDuplicateStudy =
      error?.code === "23505" ||
      String(error?.message || "").toLowerCase().includes("duplicate") ||
      String(error?.message || "").includes("contracts_study_id_unique");

    if (!isDuplicateStudy) {
      throw internalServerError(
        params.source === "access"
          ? "No se pudo generar el contrato desde el acceso"
          : "No se pudo generar el contrato",
        error?.message,
      );
    }

    const existing = await deps.repositories.contracts.findByStudyId(
      params.study.id,
    );

    if (!existing) {
      throw internalServerError(
        "Se detectó un contrato duplicado pero no se pudo recuperar",
        error?.message,
      );
    }

    return existing;
  }
}

async function getContractReservationContext(
  deps: ServerDependencies,
  contractId: string,
) {
  const contract = await deps.repositories.contracts.findById(contractId);

  if (!contract) {
    throw notFound("Contrato no encontrado", "El contrato no existe");
  }

  const reservation = await deps.repositories.reservations.findByContractId(
    contract.id,
  );

  return {
    contract,
    reservation,
  };
}

async function buildPaymentSelectionContext(
  deps: ServerDependencies,
  contractId: string,
) {
  const { contract, reservation } = await getContractReservationContext(
    deps,
    contractId,
  );

  if (!reservation) {
    throw notFound("No existe una reserva asociada a este contrato");
  }

  if (reservation.payment_status === "paid") {
    throw conflict("La reserva ya está pagada");
  }

  if (reservation.reservation_status !== "pending_payment") {
    throw conflict(
      "La reserva ya no está pendiente de pago",
      JSON.stringify({
        paymentStatus: reservation.payment_status ?? null,
        reservationStatus: reservation.reservation_status ?? null,
      }),
    );
  }

  const ctx = await getContractContextFromStudy(deps, contract.study_id);
  const resolvedReservation = resolveReservationAmountForInstallation({
    assignedKwp: ctx.assignedKwp,
    fallbackAmount:
      reservation.signal_amount ??
      contract?.metadata?.signal_amount ??
      deps.env.defaultSignalAmountEur,
    installation: ctx.installation,
  });

  return {
    contract,
    ctx,
    reservation,
    reservationAmountSource: resolvedReservation.source,
    reservationMode: resolvedReservation.reservationMode,
    signalAmount: resolvedReservation.signalAmount,
  };
}

function getRecordMetadata(record: any) {
  return record?.metadata && typeof record.metadata === "object"
    ? record.metadata
    : {};
}

function getPaymentOptionsAvailable() {
  return ["bank_transfer", "stripe"];
}

function buildPendingBankTransferResponse(params: {
  contract: any;
  ctx: any;
  deps: ServerDependencies;
  emailDeliveryStatus: "sent" | "pending_retry";
  message: string;
  paymentDeadlineAt: string;
  paymentFlowStatus: string;
  reservation: any;
  reservationAmountSource: string;
  reservationMode: string;
  signalAmount: number;
}) {
  const paymentInstructionsSentAt = getPaymentInstructionsSentAt(
    params.contract,
    params.reservation,
  );
  const lastPaymentInstructionsSentAt = getLastPaymentInstructionsSentAt(
    params.contract,
    params.reservation,
  );
  const paymentInstructionsSentCount = getPaymentInstructionsSentCount(
    params.contract,
    params.reservation,
  );

  return {
    bankTransfer: {
      beneficiary: resolveInstallationBankBeneficiary(
        params.ctx.installation,
        "Sapiens Energía",
      ),
      concept:
        getRecordMetadata(params.reservation).transfer_concept ??
        getRecordMetadata(params.contract).transfer_concept ??
        `${params.ctx.client.nombre} ${params.ctx.client.apellidos}`.trim(),
      emailSentTo: params.ctx.client.email ?? null,
      iban: resolveInstallationBankIban(
        params.ctx.installation,
        params.deps.env.sapiensBankAccountIban,
      ),
      paymentDeadlineAt: params.paymentDeadlineAt,
      supportEmail: resolveInstallationContactEmail(
        params.ctx.installation,
        params.deps.env.sapiensContactEmail,
      ),
    },
    contract: {
      contractNumber:
        params.contract.contract_number ?? params.contract.contractNumber ?? null,
      id: params.contract.id,
      status: params.contract.status,
    },
    emailDeliveryStatus: params.emailDeliveryStatus,
    lastPaymentInstructionsSentAt,
    message: params.message,
    nextStep: "pending_bank_transfer" as ContractNextStep,
    paymentFlowStatus: params.paymentFlowStatus,
    paymentInstructionsSentAt,
    paymentInstructionsSentCount,
    reservation: {
      currency:
        params.reservation.currency ??
        getRecordMetadata(params.contract).currency ??
        "eur",
      id: params.reservation.id,
      installationName: params.ctx.installation.nombre_instalacion,
      paymentDeadlineAt: params.paymentDeadlineAt,
      paymentMethod: "bank_transfer" as const,
      paymentStatus: params.reservation.payment_status ?? "pending",
      reservationAmountSource: params.reservationAmountSource,
      reservationMode: params.reservationMode,
      reservationStatus: params.reservation.reservation_status ?? "pending_payment",
      reservedKwp: Number(params.reservation.reserved_kwp ?? params.ctx.assignedKwp ?? 0),
      signalAmount: params.signalAmount,
    },
    success: true,
  };
}

async function updateContractAndReservationForPendingInstructions(
  deps: ServerDependencies,
  params: {
    contract: any;
    currency: string;
    nowIso: string;
    paymentDeadlineAt: string;
    reservation: any;
    reservationAmountSource: string;
    reservationMode: string;
    signalAmount: number;
    transferContext: {
      bankAccountIban: string;
      bankBeneficiary: string;
      bankSupportEmail: string;
      transferConcept: string;
    };
  },
) {
  const existingSelectedAt =
    getPaymentMethodSelectedAt(params.contract, params.reservation) ?? params.nowIso;

  const reservationMetadata = {
    ...getRecordMetadata(params.reservation),
    bank_account_iban: params.transferContext.bankAccountIban,
    bank_beneficiary: params.transferContext.bankBeneficiary,
    bank_support_email: params.transferContext.bankSupportEmail,
    payment_flow_status: "pending_payment_instructions",
    payment_method: "bank_transfer",
    payment_method_selected_at: existingSelectedAt,
    payment_options_available: getPaymentOptionsAvailable(),
    reservation_amount_source: params.reservationAmountSource,
    reservation_mode: params.reservationMode,
    transfer_concept: params.transferContext.transferConcept,
  };

  const contractMetadata = {
    ...getRecordMetadata(params.contract),
    bank_account_iban: params.transferContext.bankAccountIban,
    bank_beneficiary: params.transferContext.bankBeneficiary,
    bank_support_email: params.transferContext.bankSupportEmail,
    currency: params.currency,
    installation_iban_aportaciones: params.transferContext.bankAccountIban,
    payment_deadline_at: params.paymentDeadlineAt,
    payment_flow_status: "pending_payment_instructions",
    payment_method: "bank_transfer",
    payment_method_selected_at: existingSelectedAt,
    payment_options_available: getPaymentOptionsAvailable(),
    payment_step: "awaiting_bank_transfer",
    reservation_amount_source: params.reservationAmountSource,
    reservation_id: params.reservation.id,
    reservation_mode: params.reservationMode,
    reservation_status: "pending_payment",
    signal_amount: params.signalAmount,
    transfer_concept: params.transferContext.transferConcept,
  };

  await deps.repositories.reservations.update(params.reservation.id, {
    currency: params.currency,
    metadata: reservationMetadata,
    payment_status: "pending",
    reservation_status: "pending_payment",
    signal_amount: params.signalAmount,
  });

  const updatedContract = await deps.repositories.contracts.update(
    params.contract.id,
    {
      metadata: contractMetadata,
      signed_at: params.contract.signed_at ?? params.nowIso,
      status: isContractCompleted(params.contract, params.reservation)
        ? params.contract.status
        : "signed",
    },
  );

  const updatedReservation =
    (await deps.repositories.reservations.findById(params.reservation.id)) ??
    params.reservation;

  return {
    contract: updatedContract,
    reservation: updatedReservation,
    selectedAt: existingSelectedAt,
  };
}

async function markPendingBankTransferInstructionsSent(
  deps: ServerDependencies,
  params: {
    contract: any;
    incrementCount?: boolean;
    nowIso: string;
    reservation: any;
    updateLastSentAt?: boolean;
  },
) {
  const currentCount = getPaymentInstructionsSentCount(
    params.contract,
    params.reservation,
  );
  const sentCount = params.incrementCount === false ? currentCount : currentCount + 1;
  const paymentInstructionsSentAt =
    getPaymentInstructionsSentAt(params.contract, params.reservation) ??
    params.nowIso;
  const lastPaymentInstructionsSentAt =
    params.updateLastSentAt === false
      ? getLastPaymentInstructionsSentAt(params.contract, params.reservation) ??
        paymentInstructionsSentAt
      : params.nowIso;

  await deps.repositories.reservations.update(params.reservation.id, {
    metadata: {
      ...getRecordMetadata(params.reservation),
      last_payment_instructions_sent_at: lastPaymentInstructionsSentAt,
      payment_flow_status: "pending_payment",
      payment_instructions_sent_at: paymentInstructionsSentAt,
      payment_instructions_sent_count: sentCount,
    },
  });

  const updatedContract = await deps.repositories.contracts.update(
    params.contract.id,
    {
      metadata: {
        ...getRecordMetadata(params.contract),
        last_payment_instructions_sent_at: lastPaymentInstructionsSentAt,
        payment_flow_status: "pending_payment",
        payment_instructions_sent_at: paymentInstructionsSentAt,
        payment_instructions_sent_count: sentCount,
      },
    },
  );

  const updatedReservation =
    (await deps.repositories.reservations.findById(params.reservation.id)) ??
    params.reservation;

  return {
    contract: updatedContract,
    reservation: updatedReservation,
    selectedAt: getPaymentMethodSelectedAt(updatedContract, updatedReservation),
  };
}

async function markPendingBankTransferAwaitingInstructions(
  deps: ServerDependencies,
  params: {
    contract: any;
    reservation: any;
  },
) {
  const updatedContract = await deps.repositories.contracts.update(
    params.contract.id,
    {
      metadata: {
        ...getRecordMetadata(params.contract),
        payment_flow_status: "pending_payment_instructions",
      },
    },
  );

  await deps.repositories.reservations.update(params.reservation.id, {
    metadata: {
      ...getRecordMetadata(params.reservation),
      payment_flow_status: "pending_payment_instructions",
    },
  });

  const updatedReservation =
    (await deps.repositories.reservations.findById(params.reservation.id)) ??
    params.reservation;

  return {
    contract: updatedContract,
    reservation: updatedReservation,
    selectedAt: getPaymentMethodSelectedAt(updatedContract, updatedReservation),
  };
}

async function ensurePendingBankTransferForContract(
  deps: ServerDependencies,
  params: {
    contract: any;
    ctx: any;
    reservation: any;
    reservationAmountSource: string;
    reservationMode: string;
    signalAmount: number;
  },
) {
  if (!params.ctx.client.email) {
    throw badRequest(
      "El cliente no tiene email para enviar las instrucciones de transferencia",
    );
  }

  if (!params.contract.contract_supabase_path && !params.contract.contract_drive_file_id) {
    throw badRequest("El contrato no tiene PDF firmado asociado");
  }

  const currency = String(
    params.reservation.currency || params.contract?.metadata?.currency || "eur",
  )
    .trim()
    .toLowerCase();
  const paymentDeadlineAt =
    params.reservation.payment_deadline_at ??
    params.contract?.metadata?.payment_deadline_at ??
    new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const bankAccountIban = resolveInstallationBankIban(
    params.ctx.installation,
    deps.env.sapiensBankAccountIban,
  );
  const bankBeneficiary = resolveInstallationBankBeneficiary(
    params.ctx.installation,
    "Sapiens Energía",
  );
  const bankSupportEmail = resolveInstallationContactEmail(
    params.ctx.installation,
    deps.env.sapiensContactEmail,
  );
  const clientFullName =
    `${params.ctx.client.nombre} ${params.ctx.client.apellidos}`.trim();
  const transferConcept = `${clientFullName} - ${params.contract.contract_number}`;
  const nowIso = new Date().toISOString();

  let synced = await updateContractAndReservationForPendingInstructions(deps, {
    contract: params.contract,
    currency,
    nowIso,
    paymentDeadlineAt,
    reservation: params.reservation,
    reservationAmountSource: params.reservationAmountSource,
    reservationMode: params.reservationMode,
    signalAmount: params.signalAmount,
    transferContext: {
      bankAccountIban,
      bankBeneficiary,
      bankSupportEmail,
      transferConcept,
    },
  });

  const paymentInstructionsSentAt = getPaymentInstructionsSentAt(
    synced.contract,
    synced.reservation,
  );

  if (paymentInstructionsSentAt) {
    synced = await markPendingBankTransferInstructionsSent(deps, {
      contract: synced.contract,
      incrementCount: false,
      nowIso,
      reservation: synced.reservation,
      updateLastSentAt: false,
    });

    return buildPendingBankTransferResponse({
      contract: synced.contract,
      ctx: params.ctx,
      deps,
      emailDeliveryStatus: "sent",
      message:
        "Contrato firmado correctamente. Ya existían instrucciones de transferencia enviadas para esta reserva.",
      paymentDeadlineAt,
      paymentFlowStatus: "pending_payment",
      reservation: synced.reservation,
      reservationAmountSource: params.reservationAmountSource,
      reservationMode: params.reservationMode,
      signalAmount: params.signalAmount,
    });
  }

  try {
    const precontractFile = params.contract.contract_supabase_path
      ? await deps.services.documents.downloadFileAsBuffer({
          bucket: params.contract.contract_supabase_bucket,
          path: params.contract.contract_supabase_path,
        })
      : await deps.services.drive.downloadFileAsBuffer(
          params.contract.contract_drive_file_id,
        );

    await deps.services.mail.sendBankTransferReservationEmail({
      bankAccountIban,
      bankBeneficiary,
      bankSupportEmail,
      clientName: clientFullName,
      contractNumber: params.contract.contract_number,
      currency,
      installationName: params.ctx.installation.nombre_instalacion,
      language: params.ctx.language,
      paymentDeadlineAt,
      precontractPdfBuffer: precontractFile.buffer,
      precontractPdfFilename:
        precontractFile.fileName ||
        `PRECONTRATO_${params.contract.contract_number}.pdf`,
      reservedKwp: Number(
        params.reservation.reserved_kwp ?? params.ctx.assignedKwp ?? 0,
      ),
      signalAmount: params.signalAmount,
      to: params.ctx.client.email,
      transferConcept,
    });

    synced = await markPendingBankTransferInstructionsSent(deps, {
      contract: synced.contract,
      nowIso,
      reservation: synced.reservation,
    });

    return buildPendingBankTransferResponse({
      contract: synced.contract,
      ctx: params.ctx,
      deps,
      emailDeliveryStatus: "sent",
      message:
        "Contrato firmado correctamente. Te hemos enviado las instrucciones de transferencia al correo.",
      paymentDeadlineAt,
      paymentFlowStatus: "pending_payment",
      reservation: synced.reservation,
      reservationAmountSource: params.reservationAmountSource,
      reservationMode: params.reservationMode,
      signalAmount: params.signalAmount,
    });
  } catch (error: any) {
    synced = await markPendingBankTransferAwaitingInstructions(deps, {
      contract: synced.contract,
      reservation: synced.reservation,
    });

    return {
      ...buildPendingBankTransferResponse({
        contract: synced.contract,
        ctx: params.ctx,
        deps,
        emailDeliveryStatus: "pending_retry",
        message:
          "Contrato firmado correctamente, pero no se han podido enviar las instrucciones de transferencia. Volveremos a intentarlo cuando reabras el enlace.",
        paymentDeadlineAt,
        paymentFlowStatus: "pending_payment_instructions",
        reservation: synced.reservation,
        reservationAmountSource: params.reservationAmountSource,
        reservationMode: params.reservationMode,
        signalAmount: params.signalAmount,
      }),
      error: error?.message ?? null,
    };
  }
}

async function resolveExistingContractNextStep(
  deps: ServerDependencies,
  params: {
    contract: any;
    ctx: any;
    reservation: any | null;
  },
) {
  if (isContractCompleted(params.contract, params.reservation)) {
    return {
      alreadySigned: true,
      contract: {
        confirmed_at: params.contract.confirmed_at ?? null,
        contract_number: params.contract.contract_number ?? null,
        id: params.contract.id,
        proposal_mode: params.contract.proposal_mode ?? null,
        signed_at: params.contract.signed_at ?? null,
        status: params.contract.status ?? null,
        uploaded_at: params.contract.uploaded_at ?? null,
      },
      message: "El pago de esta reserva ya ha sido confirmado.",
      nextStep: "completed" as ContractNextStep,
      reservationSummary: params.reservation
        ? {
            paymentDeadlineAt: params.reservation.payment_deadline_at ?? null,
            paymentStatus: params.reservation.payment_status ?? null,
            reservationStatus: params.reservation.reservation_status ?? null,
          }
        : null,
      success: true,
    };
  }

  if (!hasContractBeenSigned(params.contract) && !params.reservation) {
    return null;
  }

  const resolvedReservation = resolveReservationAmountForInstallation({
    assignedKwp: params.ctx.assignedKwp,
    fallbackAmount:
      params.reservation?.signal_amount ??
      params.contract?.metadata?.signal_amount ??
      deps.env.defaultSignalAmountEur,
    installation: params.ctx.installation,
  });

  let reservation = params.reservation;

  if (!reservation) {
    const paymentDeadlineAt =
      params.contract?.metadata?.payment_deadline_at ??
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

    reservation = await deps.repositories.reservations.createPendingReservation({
      clientId: params.ctx.client.id,
      contractId: params.contract.id,
      installationId: params.ctx.installation.id,
      notes:
        "Reserva recuperada desde contrato firmado y pendiente de instrucciones de pago",
      paymentDeadlineAt,
      reservedKwp: params.ctx.assignedKwp,
      studyId: params.ctx.study.id,
    });

    if (!reservation?.id) {
      throw internalServerError("No se pudo recuperar la reserva del contrato");
    }
  }

  if (
    ENABLE_PAYMENT_METHOD_SELECTOR &&
    !getContractPaymentMethod(params.contract, reservation)
  ) {
    return {
      alreadySigned: true,
      contract: {
        confirmed_at: params.contract.confirmed_at ?? null,
        contract_number: params.contract.contract_number ?? null,
        id: params.contract.id,
        proposal_mode: params.contract.proposal_mode ?? null,
        signed_at: params.contract.signed_at ?? null,
        status: params.contract.status ?? null,
        uploaded_at: params.contract.uploaded_at ?? null,
      },
      message: "El contrato ya está firmado. Selecciona el método de pago para continuar.",
      nextStep: "select_payment_method" as ContractNextStep,
      reservationSummary: {
        paymentDeadlineAt: reservation.payment_deadline_at ?? null,
        paymentStatus: reservation.payment_status ?? null,
        reservationStatus: reservation.reservation_status ?? null,
      },
      success: true,
    };
  }

  const pendingTransfer = await ensurePendingBankTransferForContract(deps, {
    contract: params.contract,
    ctx: params.ctx,
    reservation,
    reservationAmountSource: resolvedReservation.source,
    reservationMode: resolvedReservation.reservationMode,
    signalAmount: resolvedReservation.signalAmount,
  });

  return {
    alreadySigned: true,
    ...pendingTransfer,
  };
}

export async function retryContractPaymentUseCase(
  deps: ServerDependencies,
  contractId: string,
) {
  const {
    contract,
    ctx,
    reservation,
    reservationAmountSource,
    reservationMode,
    signalAmount,
  } = await buildPaymentSelectionContext(deps, contractId);

  const currency = String(
    reservation.currency || contract?.metadata?.currency || "eur",
  )
    .trim()
    .toLowerCase();

  const paymentDeadlineAt =
    reservation.payment_deadline_at ??
    new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  const checkoutSession =
    await deps.services.stripe.createCheckoutSessionForReservation({
      clientEmail: ctx.client.email ?? null,
      clientId: ctx.client.id,
      contractId: contract.id,
      currency,
      installationId: ctx.installation.id,
      installationName: ctx.installation.nombre_instalacion,
      paymentDeadlineAt,
      reservationId: reservation.id,
      signalAmount,
      studyId: ctx.study.id,
    });

  await deps.repositories.reservations.update(reservation.id, {
    currency,
    metadata: {
      ...(reservation.metadata ?? {}),
      reservation_amount_source: reservationAmountSource,
      reservation_mode: reservationMode,
    },
    signal_amount: signalAmount,
    stripe_checkout_session_id: checkoutSession.id,
  });

  await deps.repositories.contracts.update(contract.id, {
    metadata: {
      ...(contract.metadata ?? {}),
      currency,
      payment_step: "redirect_to_stripe",
      reservation_amount_source: reservationAmountSource,
      reservation_mode: reservationMode,
      signal_amount: signalAmount,
      stripe_checkout_session_id: checkoutSession.id,
    },
  });

  return {
    currency,
    reservationAmountSource,
    reservationId: reservation.id,
    reservationMode,
    signalAmount,
    stripe: {
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
    },
    success: true,
  };
}

export async function getContractReservationStatusUseCase(
  deps: ServerDependencies,
  contractId: string,
) {
  const { contract, reservation } = await getContractReservationContext(
    deps,
    contractId,
  );

  if (!contract) {
    throw notFound("Contrato no encontrado", "El contrato no existe");
  }

  return {
    contract: {
      contract_number: contract.contract_number,
      id: contract.id,
      status: contract.status,
    },
    reservation: reservation
      ? {
          confirmedAt: reservation.confirmed_at,
          currency: reservation.currency,
          id: reservation.id,
          paymentDeadlineAt: reservation.payment_deadline_at,
          paymentStatus: reservation.payment_status,
          releasedAt: reservation.released_at,
          reservationStatus: reservation.reservation_status,
          signalAmount: reservation.signal_amount,
        }
      : null,
    success: true,
  };
}

export async function previewProposalAccessUseCase(
  deps: ServerDependencies,
  token: string,
) {
  const { accessToken, installation, study } = await getProposalAccessContext(
    deps,
    token,
  );

  const existingContract = await deps.repositories.contracts.findByStudyId(study.id);
  const existingReservation = existingContract
    ? await deps.repositories.reservations.findByContractId(existingContract.id)
    : null;

  const language = normalizeAppLanguage(study.language);
  const allowedModes = getAllowedProposalModes(installation.modalidad);

  return {
    access: {
      clientId: accessToken.client_id,
      expiresAt: accessToken.expires_at ?? null,
      installationId: installation.id,
      studyId: study.id,
    },
    existingContract: existingContract
      ? {
          contractNumber: existingContract.contract_number ?? null,
          id: existingContract.id,
          proposalMode: existingContract.proposal_mode ?? null,
          signedAt: existingContract.signed_at ?? null,
          status: existingContract.status ?? null,
          uploadedAt: existingContract.uploaded_at ?? null,
        }
      : null,
    existingReservation: existingReservation
      ? {
          contractId: existingContract?.id ?? null,
          contractNumber: existingContract?.contract_number ?? null,
          currency: existingReservation.currency ?? null,
          id: existingReservation.id,
          installationAddress: installation.direccion ?? null,
          installationName: installation.nombre_instalacion ?? null,
          paymentDeadlineAt: existingReservation.payment_deadline_at ?? null,
          paymentStatus: existingReservation.payment_status ?? null,
          proposalMode: existingContract?.proposal_mode ?? null,
          reservationStatus: existingReservation.reservation_status ?? null,
          reservedKwp: existingReservation.reserved_kwp ?? study.assigned_kwp ?? null,
          signalAmount: existingReservation.signal_amount ?? null,
        }
      : null,
    installation: {
      availableProposalModes: allowedModes,
      cantidad_precio_fijo: installation.cantidad_precio_fijo ?? null,
      coste_kwh_inversion: installation.coste_kwh_inversion ?? null,
      coste_kwh_servicio: installation.coste_kwh_servicio ?? null,
      defaultProposalMode: allowedModes[0] ?? "investment",
      direccion: installation.direccion,
      horas_efectivas: installation.horas_efectivas ?? null,
      id: installation.id,
      modalidad: installation.modalidad,
      nombre_instalacion: installation.nombre_instalacion,
      pago: installation.pago ?? null,
      porcentaje_autoconsumo: installation.porcentaje_autoconsumo ?? null,
    },
    language,
    study: {
      assigned_kwp: study.assigned_kwp ?? null,
      calculation: study.calculation ?? null,
      email_status: study.email_status ?? null,
      id: study.id,
      language,
      selected_installation_id: study.selected_installation_id ?? null,
      selected_installation_snapshot: study.selected_installation_snapshot ?? null,
      status: study.status ?? null,
    },
    success: true,
  };
}

export async function validateProposalAccessUseCase(
  deps: ServerDependencies,
  params: {
    apellidos: string;
    dni: string;
    nombre: string;
    token: string;
  },
) {
  if (!params.token || !params.dni || !params.nombre || !params.apellidos) {
    throw badRequest("Faltan token, DNI, nombre o apellidos");
  }

  const { accessToken, installation, study } = await getProposalAccessContext(
    deps,
    params.token,
  );

  const client = await deps.repositories.clients.findById(accessToken.client_id);

  if (!client) {
    throw notFound(
      "No se encontró el cliente asociado al acceso",
      "Cliente no encontrado",
    );
  }

  const sameDni = normalizeDni(client.dni) === normalizeDni(params.dni);
  const sameNombre =
    normalizeIdentityText(client.nombre) ===
    normalizeIdentityText(params.nombre);
  const sameApellidos =
    normalizeIdentityText(client.apellidos) ===
    normalizeIdentityText(params.apellidos);

  if (!sameDni || !sameNombre || !sameApellidos) {
    throw unauthorized(
      "Los datos introducidos no coinciden con la propuesta",
    );
  }

  const existingContract = await deps.repositories.contracts.findByStudyId(study.id);
  const resumeToken = signContractResumeToken(
    deps.env.contractResumeJwtSecret,
    {
      clientId: client.id,
      installationId: installation.id,
      studyId: study.id,
    },
  );
  const language = normalizeAppLanguage(study.language);
  const availableProposalModes = getAllowedProposalModes(installation.modalidad);

  return {
    access: {
      clientId: client.id,
      expiresAt: accessToken.expires_at ?? null,
      installationId: installation.id,
      studyId: study.id,
      usedAt: accessToken.used_at ?? null,
    },
    client: {
      apellidos: client.apellidos,
      cups: client.cups ?? null,
      direccion_completa: client.direccion_completa ?? null,
      dni: client.dni,
      documentos_supabase_bucket: client.documentos_supabase_bucket ?? null,
      email: client.email ?? null,
      factura_supabase_path: client.factura_supabase_path ?? null,
      id: client.id,
      nombre: client.nombre,
      propuesta_supabase_path: client.propuesta_supabase_path ?? null,
      supabase_folder_path: client.supabase_folder_path ?? null,
      telefono: client.telefono ?? null,
    },
    existingContract: existingContract
      ? {
          contract_number: existingContract.contract_number,
          id: existingContract.id,
          proposal_mode: existingContract.proposal_mode,
          status: existingContract.status,
        }
      : null,
    installation: {
      availableProposalModes,
      cantidad_precio_fijo: installation.cantidad_precio_fijo ?? null,
      defaultProposalMode: availableProposalModes[0] ?? "investment",
      direccion: installation.direccion,
      id: installation.id,
      modalidad: installation.modalidad,
      nombre_instalacion: installation.nombre_instalacion,
      pago: installation.pago ?? null,
    },
    language,
    resumeToken,
    study: {
      assigned_kwp: study.assigned_kwp ?? null,
      calculation: study.calculation ?? null,
      email_status: study.email_status ?? null,
      id: study.id,
      language,
      selected_installation_id: study.selected_installation_id ?? null,
      selected_installation_snapshot: study.selected_installation_snapshot ?? null,
      status: study.status ?? null,
    },
    success: true,
  };
}

export async function generateContractFromAccessUseCase(
  deps: ServerDependencies,
  params: {
    proposalMode?: unknown;
    resumeToken: string;
  },
) {
  if (!params.resumeToken) {
    throw badRequest("Falta resumeToken");
  }

  let decoded: {
    clientId: string;
    installationId: string;
    studyId: string;
  };

  try {
    decoded = verifyContractResumeToken(
      deps.env.contractResumeJwtSecret,
      params.resumeToken,
    );
  } catch {
    throw unauthorized("El acceso ha caducado o no es válido");
  }

  const study = await deps.repositories.studies.findById(decoded.studyId);
  if (!study) {
    throw notFound("No se encontró el estudio", "Estudio no encontrado");
  }

  const client = await deps.repositories.clients.findById(decoded.clientId);
  if (!client) {
    throw notFound("No se encontró el cliente", "Cliente no encontrado");
  }

  const installation = await deps.repositories.installations.findById(
    decoded.installationId,
  );
  if (!installation) {
    throw notFound("No se encontró la instalación", "Instalación no encontrada");
  }

  const assignedKwp =
    toPositiveNumber(study.assigned_kwp) ??
    toPositiveNumber(study?.calculation?.recommendedPowerKwp) ??
    toPositiveNumber(study?.selected_installation_snapshot?.assigned_kwp);

  if (assignedKwp === null) {
    throw badRequest("El estudio no tiene assigned_kwp válido");
  }

  const proposalMode = resolveProposalMode(
    params.proposalMode,
    installation.modalidad,
  );

  const existingContract = await deps.repositories.contracts.findByStudyId(study.id);

  if (existingContract) {
    const existingReservation = await deps.repositories.reservations.findByContractId(
      existingContract.id,
    );
    const existingStep = await resolveExistingContractNextStep(deps, {
      contract: existingContract,
      ctx: {
        assignedKwp,
        client,
        installation,
        language: normalizeAppLanguage(study.language),
        study,
      },
      reservation: existingReservation,
    });

    if (existingStep) {
      return existingStep;
    }
  }

  const contract = await getOrCreateGeneratedContract(deps, {
    assignedKwp,
    clientId: client.id,
    empresaId:
      study?.empresa_id ??
      installation?.empresa_id ??
      client?.empresa_id ??
      null,
    installationId: installation.id,
    proposalMode,
    source: "access",
    study,
  });

  const language = normalizeAppLanguage(study.language);
  const commercial = buildContractCommercialSummary({
    assignedKwp,
    installation,
    proposalMode: contract.proposal_mode,
    study,
  });
  const previewHtml = buildBasicContractHtml({
    assignedKwp,
    client,
    commercial,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    installation,
    language,
    proposalMode: contract.proposal_mode,
    study,
  });

  return {
    contract,
    preview: {
      assignedKwp,
      commercial,
      client: {
        apellidos: client.apellidos,
        dni: client.dni,
        email: client.email,
        id: client.id,
        nombre: client.nombre,
        telefono: client.telefono,
      },
      contractId: contract.id,
      contractNumber: contract.contract_number,
      installation: {
        almacenamiento_kwh: installation.almacenamiento_kwh ?? null,
        direccion: installation.direccion,
        empresa: installation.empresa
          ? {
              cif: installation.empresa.cif ?? null,
              id: installation.empresa.id ?? null,
              nombre: installation.empresa.nombre ?? null,
            }
          : null,
        horas_efectivas: installation.horas_efectivas ?? null,
        id: installation.id,
        iban_aportaciones: resolveInstallationBankIban(
          installation,
          deps.env.sapiensBankAccountIban,
        ),
        modalidad: installation.modalidad ?? null,
        nombre_instalacion: installation.nombre_instalacion,
        porcentaje_autoconsumo: installation.porcentaje_autoconsumo ?? null,
        potencia_instalada_kwp: installation.potencia_instalada_kwp ?? null,
      },
      proposalMode: contract.proposal_mode,
      extraConsumption: study?.invoice_data?.extraConsumption ?? null,
    },
    previewHtml,
    success: true,
  };
}

export async function generateContractFromStudyUseCase(
  deps: ServerDependencies,
  params: {
    proposalMode?: unknown;
    studyId: string;
  },
) {
  const ctx = await getContractContextFromStudy(deps, params.studyId);
  const proposalMode = resolveProposalMode(
    params.proposalMode,
    ctx.installation.modalidad,
  );

  const contract = await getOrCreateGeneratedContract(deps, {
    assignedKwp: ctx.assignedKwp,
    clientId: ctx.client.id,
    empresaId:
      ctx.study?.empresa_id ??
      ctx.installation?.empresa_id ??
      ctx.client?.empresa_id ??
      null,
    installationId: ctx.installation.id,
    proposalMode,
    source: "study",
    study: ctx.study,
  });

  const previewHtml = buildBasicContractHtml({
    assignedKwp: ctx.assignedKwp,
    client: ctx.client,
    commercial: buildContractCommercialSummary({
      assignedKwp: ctx.assignedKwp,
      installation: ctx.installation,
      proposalMode: contract.proposal_mode,
      study: ctx.study,
    }),
    contractId: contract.id,
    contractNumber: contract.contract_number,
    installation: ctx.installation,
    language: ctx.language,
    proposalMode: contract.proposal_mode,
    study: ctx.study,
  });

  return {
    contract,
    preview: {
      assignedKwp: ctx.assignedKwp,
      commercial: buildContractCommercialSummary({
        assignedKwp: ctx.assignedKwp,
        installation: ctx.installation,
        proposalMode: contract.proposal_mode,
        study: ctx.study,
      }),
      client: {
        apellidos: ctx.client.apellidos,
        dni: ctx.client.dni,
        email: ctx.client.email,
        id: ctx.client.id,
        nombre: ctx.client.nombre,
        telefono: ctx.client.telefono,
      },
      contractId: contract.id,
      contractNumber: contract.contract_number,
      installation: {
        almacenamiento_kwh: ctx.installation.almacenamiento_kwh ?? null,
        direccion: ctx.installation.direccion,
        empresa: ctx.installation.empresa
          ? {
              cif: ctx.installation.empresa.cif ?? null,
              id: ctx.installation.empresa.id ?? null,
              nombre: ctx.installation.empresa.nombre ?? null,
            }
          : null,
        horas_efectivas: ctx.installation.horas_efectivas ?? null,
        id: ctx.installation.id,
        iban_aportaciones: resolveInstallationBankIban(
          ctx.installation,
          deps.env.sapiensBankAccountIban,
        ),
        modalidad: ctx.installation.modalidad ?? null,
        nombre_instalacion: ctx.installation.nombre_instalacion,
        porcentaje_autoconsumo: ctx.installation.porcentaje_autoconsumo ?? null,
        potencia_instalada_kwp: ctx.installation.potencia_instalada_kwp ?? null,
      },
      proposalMode: contract.proposal_mode,
      extraConsumption: ctx.study?.invoice_data?.extraConsumption ?? null,
    },
    previewHtml,
    success: true,
  };
}

export async function getContractByIdUseCase(
  deps: ServerDependencies,
  contractId: string,
) {
  const contract = await deps.repositories.contracts.findById(contractId);

  if (!contract) {
    throw notFound("Contrato no encontrado", "El contrato no existe");
  }

  return contract;
}

export async function signContractUseCase(
  deps: ServerDependencies,
  params: {
    contractId: string;
    currency?: string;
    signalAmount?: unknown;
    signedContractFile: Express.Multer.File | null;
  },
) {
  if (!params.signedContractFile) {
    throw badRequest("Debes enviar el PDF firmado del pre-contrato");
  }

  const contract = await deps.repositories.contracts.findById(params.contractId);

  if (!contract) {
    throw notFound("Contrato no encontrado", "El contrato no existe");
  }

  const ctx = await getContractContextFromStudy(deps, contract.study_id);
  const existingReservation = await deps.repositories.reservations.findByContractId(
    contract.id,
  );

  if (contract.status !== "generated" || existingReservation) {
    const existingStep = await resolveExistingContractNextStep(deps, {
      contract,
      ctx,
      reservation: existingReservation,
    });

    if (existingStep) {
      return existingStep;
    }

    return {
      alreadySigned: true,
      contract: {
        contract_number: contract.contract_number,
        id: contract.id,
        status: contract.status,
      },
      error: "Este pre-contrato ya fue firmado anteriormente",
      message: "Este pre-contrato ya fue firmado anteriormente",
    };
  }

  const uploadedContract = await deps.services.documents.uploadClientDocument({
    apellidos: ctx.client.apellidos,
    buffer: params.signedContractFile.buffer,
    dni: ctx.client.dni,
    fileName: "contrato-firmado.pdf",
    mimeType: params.signedContractFile.mimetype || "application/pdf",
    nombre: ctx.client.nombre,
  });

  const paymentDeadlineAt = new Date(
    Date.now() + 15 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const resolvedReservation = resolveReservationAmountForInstallation({
    assignedKwp: ctx.assignedKwp,
    fallbackAmount:
      params.signalAmount ??
      contract?.metadata?.signal_amount ??
      deps.env.defaultSignalAmountEur,
    installation: ctx.installation,
  });

  const signalAmount = resolvedReservation.signalAmount;
  const reservationMode = resolvedReservation.reservationMode;
  const reservationAmountSource = resolvedReservation.source;
  const bankAccountIban = resolveInstallationBankIban(
    ctx.installation,
    deps.env.sapiensBankAccountIban,
  );
  const currency = String(params.currency || "eur").trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const reservation = await deps.repositories.reservations.createPendingReservation(
    {
      clientId: ctx.client.id,
      contractId: contract.id,
      installationId: ctx.installation.id,
      notes:
        "Reserva creada tras firma del pre-contrato y pendiente de transferencia bancaria",
      paymentDeadlineAt,
      reservedKwp: ctx.assignedKwp,
      studyId: ctx.study.id,
    },
  );

  if (!reservation?.id) {
    throw internalServerError("La reserva se creó pero no devolvió id");
  }
  const updatedContract = await deps.repositories.contracts.update(contract.id, {
    contract_supabase_bucket: uploadedContract.bucket,
    contract_supabase_path: uploadedContract.path,
    supabase_folder_path: uploadedContract.folderPath,
    metadata: {
      ...(contract.metadata ?? {}),
      assigned_kwp: ctx.assignedKwp,
      contract_supabase_bucket: uploadedContract.bucket,
      contract_supabase_path: uploadedContract.path,
      currency,
      installation_iban_aportaciones: bankAccountIban,
      payment_deadline_at: paymentDeadlineAt,
      payment_flow_status: "pending_payment_instructions",
      payment_method: ENABLE_PAYMENT_METHOD_SELECTOR ? null : "bank_transfer",
      payment_method_selected_at: ENABLE_PAYMENT_METHOD_SELECTOR ? null : nowIso,
      payment_status: "pending",
      payment_step: ENABLE_PAYMENT_METHOD_SELECTOR
        ? "pending_method_selection"
        : "awaiting_bank_transfer",
      reservation_amount_source: reservationAmountSource,
      reservation_created: true,
      reservation_id: reservation.id,
      reservation_mode: reservationMode,
      reservation_status: "pending_payment",
      signal_amount: signalAmount,
    },
    signed_at: nowIso,
    status: "signed",
    uploaded_at: nowIso,
  });

  if (ENABLE_PAYMENT_METHOD_SELECTOR) {
    await deps.repositories.reservations.update(reservation.id, {
      currency,
      metadata: {
        installation_iban_aportaciones: bankAccountIban,
        payment_flow_status: "pending_method_selection",
        payment_method: null,
        payment_method_selected_at: null,
        payment_options_available: ["stripe", "bank_transfer"],
        reservation_amount_source: reservationAmountSource,
        reservation_mode: reservationMode,
      },
      signal_amount: signalAmount,
    });

    return {
      contract: updatedContract,
      drive: {
        contractFileUrl: null,
        contractFolderUrl: null,
        contractsRootFolderUrl: null,
      },
      storage: {
        bucket: uploadedContract.bucket,
        contractPath: uploadedContract.path,
        folderPath: uploadedContract.folderPath,
      },
      message:
        "Pre-contrato firmado y reserva creada correctamente. Ahora el cliente debe seleccionar la forma de pago.",
      payment: {
        availableMethods: [
          {
            id: "bank_transfer",
            label: "Transferencia bancaria",
          },
          {
            id: "stripe",
            label: "Tarjeta",
          },
        ],
        step: "select_method",
      },
      reservation: {
        currency,
        id: reservation.id,
        installationName: ctx.installation.nombre_instalacion,
        paymentDeadlineAt,
        paymentStatus: "pending",
        reservationAmountSource,
        reservationMode,
        reservationStatus: "pending_payment",
        reservedKwp: ctx.assignedKwp,
        signalAmount,
      },
      success: true,
    };
  }

  const pendingTransfer = await ensurePendingBankTransferForContract(deps, {
    contract: updatedContract,
    ctx,
    reservation,
    reservationAmountSource,
    reservationMode,
    signalAmount,
  });

  return {
    ...pendingTransfer,
    drive: {
      contractFileUrl: null,
      contractFolderUrl: null,
      contractsRootFolderUrl: null,
    },
    storage: {
      bucket: uploadedContract.bucket,
      contractPath: uploadedContract.path,
      folderPath: uploadedContract.folderPath,
    },
  };
}

export async function startStripePaymentUseCase(
  deps: ServerDependencies,
  contractId: string,
) {
  const {
    contract,
    ctx,
    reservation,
    reservationAmountSource,
    reservationMode,
    signalAmount,
  } = await buildPaymentSelectionContext(deps, contractId);

  const currency = String(
    reservation.currency || contract?.metadata?.currency || "eur",
  )
    .trim()
    .toLowerCase();

  const paymentDeadlineAt =
    reservation.payment_deadline_at ??
    new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  const checkoutSession =
    await deps.services.stripe.createCheckoutSessionForReservation({
      clientEmail: ctx.client.email ?? null,
      clientId: ctx.client.id,
      contractId: contract.id,
      currency,
      installationId: ctx.installation.id,
      installationName: ctx.installation.nombre_instalacion,
      paymentDeadlineAt,
      reservationId: reservation.id,
      signalAmount,
      studyId: ctx.study.id,
    });

  const nowIso = new Date().toISOString();

  await deps.repositories.reservations.update(reservation.id, {
    currency,
    metadata: {
      ...(reservation.metadata ?? {}),
      payment_method: "stripe",
      payment_method_selected_at: nowIso,
      reservation_amount_source: reservationAmountSource,
      reservation_mode: reservationMode,
    },
    signal_amount: signalAmount,
    stripe_checkout_session_id: checkoutSession.id,
  });

  const updatedContract = await deps.repositories.contracts.update(contract.id, {
    metadata: {
      ...(contract.metadata ?? {}),
      currency,
      payment_method: "stripe",
      payment_method_selected_at: nowIso,
      payment_step: "redirect_to_stripe",
      reservation_amount_source: reservationAmountSource,
      reservation_mode: reservationMode,
      signal_amount: signalAmount,
      stripe_checkout_session_id: checkoutSession.id,
    },
  });

  return {
    contract: {
      contractNumber: updatedContract.contract_number,
      id: updatedContract.id,
      status: updatedContract.status,
    },
    message:
      "Método de pago seleccionado correctamente. Redirigiendo a Stripe.",
    reservation: {
      currency,
      id: reservation.id,
      paymentDeadlineAt,
      paymentMethod: "stripe",
      paymentStatus: reservation.payment_status ?? "pending",
      reservationAmountSource,
      reservationMode,
      reservationStatus: reservation.reservation_status ?? "pending_payment",
      signalAmount,
    },
    stripe: {
      checkoutSessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
    },
    success: true,
  };
}

export async function startBankTransferPaymentUseCase(
  deps: ServerDependencies,
  contractId: string,
) {
  const {
    contract,
    ctx,
    reservation,
    reservationAmountSource,
    reservationMode,
    signalAmount,
  } = await buildPaymentSelectionContext(deps, contractId);

  return ensurePendingBankTransferForContract(deps, {
    contract,
    ctx,
    reservation,
    reservationAmountSource,
    reservationMode,
    signalAmount,
  });
}
