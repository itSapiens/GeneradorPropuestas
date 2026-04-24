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
import { buildBasicContractHtml } from "../../domain/contracts/contractHtml";
import {
  resolveInstallationBankIban,
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
import {
  buildContractFileName,
  buildContractNumber,
} from "../../infrastructure/external/drive/driveStorageService";
import { toPositiveNumber } from "../../utils/parsingUtils";

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

  const language = normalizeAppLanguage(study.language);
  const allowedModes = getAllowedProposalModes(installation.modalidad);

  return {
    access: {
      clientId: accessToken.client_id,
      expiresAt: accessToken.expires_at ?? null,
      installationId: installation.id,
      studyId: study.id,
    },
    installation: {
      availableProposalModes: allowedModes,
      coste_kwh_inversion: installation.coste_kwh_inversion ?? null,
      coste_kwh_servicio: installation.coste_kwh_servicio ?? null,
      defaultProposalMode: allowedModes[0] ?? "investment",
      direccion: installation.direccion,
      horas_efectivas: installation.horas_efectivas ?? null,
      id: installation.id,
      modalidad: installation.modalidad,
      nombre_instalacion: installation.nombre_instalacion,
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
      email: client.email ?? null,
      factura_drive_url: client.factura_drive_url ?? null,
      id: client.id,
      nombre: client.nombre,
      propuesta_drive_url: client.propuesta_drive_url ?? null,
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
      defaultProposalMode: availableProposalModes[0] ?? "investment",
      direccion: installation.direccion,
      id: installation.id,
      modalidad: installation.modalidad,
      nombre_instalacion: installation.nombre_instalacion,
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

  const contract = await getOrCreateGeneratedContract(deps, {
    assignedKwp,
    clientId: client.id,
    installationId: installation.id,
    proposalMode,
    source: "access",
    study,
  });

  const existingReservation = await deps.repositories.reservations.findByContractId(
    contract.id,
  );

  const alreadySigned =
    contract.status !== "generated" ||
    Boolean(contract.signed_at) ||
    Boolean(contract.uploaded_at) ||
    Boolean(existingReservation);

  if (alreadySigned) {
    return {
      alreadySigned: true,
      contract: {
        confirmed_at: contract.confirmed_at ?? null,
        contract_number: contract.contract_number,
        id: contract.id,
        proposal_mode: contract.proposal_mode,
        signed_at: contract.signed_at ?? null,
        status: contract.status,
        uploaded_at: contract.uploaded_at ?? null,
      },
      message: "Este pre-contrato ya fue firmado anteriormente.",
      reservationSummary: existingReservation
        ? {
            paymentDeadlineAt: existingReservation.payment_deadline_at ?? null,
            paymentStatus: existingReservation.payment_status ?? null,
            reservationStatus: existingReservation.reservation_status ?? null,
          }
        : null,
      success: false,
    };
  }

  const language = normalizeAppLanguage(study.language);
  const previewHtml = buildBasicContractHtml({
    assignedKwp,
    client,
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
        horas_efectivas: installation.horas_efectivas ?? null,
        id: installation.id,
        nombre_instalacion: installation.nombre_instalacion,
        porcentaje_autoconsumo: installation.porcentaje_autoconsumo ?? null,
        potencia_instalada_kwp: installation.potencia_instalada_kwp ?? null,
      },
      proposalMode: contract.proposal_mode,
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
    installationId: ctx.installation.id,
    proposalMode,
    source: "study",
    study: ctx.study,
  });

  const previewHtml = buildBasicContractHtml({
    assignedKwp: ctx.assignedKwp,
    client: ctx.client,
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
        horas_efectivas: ctx.installation.horas_efectivas ?? null,
        id: ctx.installation.id,
        nombre_instalacion: ctx.installation.nombre_instalacion,
        porcentaje_autoconsumo: ctx.installation.porcentaje_autoconsumo ?? null,
        potencia_instalada_kwp: ctx.installation.potencia_instalada_kwp ?? null,
      },
      proposalMode: contract.proposal_mode,
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

  if (contract.status !== "generated") {
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

  const existingReservation = await deps.repositories.reservations.findByContractId(
    contract.id,
  );

  if (existingReservation) {
    return {
      alreadySigned: true,
      contract: {
        contract_number: contract.contract_number,
        id: contract.id,
        status: contract.status,
      },
      error: "Este pre-contrato ya tiene una reserva asociada",
      message: "Este pre-contrato ya fue firmado anteriormente",
      reservationSummary: {
        currency: existingReservation.currency ?? null,
        paymentDeadlineAt: existingReservation.payment_deadline_at ?? null,
        paymentStatus: existingReservation.payment_status ?? null,
        reservationId: existingReservation.id,
        reservationMode:
          (existingReservation.metadata as any)?.reservation_mode ?? null,
        reservationStatus: existingReservation.reservation_status ?? null,
        signalAmount: existingReservation.signal_amount ?? null,
        stripeCheckoutSessionId:
          existingReservation.stripe_checkout_session_id ?? null,
      },
    };
  }

  const ctx = await getContractContextFromStudy(deps, contract.study_id);
  const contractsFolders =
    await deps.services.drive.ensureContractsStatusFolder("PendientesPago");

  const contractFileName = buildContractFileName({
    apellidos: ctx.client.apellidos,
    contractId: contract.id,
    dni: ctx.client.dni,
    nombre: ctx.client.nombre,
  });

  const uploadedContract = await deps.services.drive.uploadBuffer({
    buffer: params.signedContractFile.buffer,
    fileName: contractFileName,
    folderId: contractsFolders.folder.id,
    mimeType: params.signedContractFile.mimetype || "application/pdf",
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

  const reservation = await deps.repositories.reservations.createPendingReservation(
    {
      clientId: ctx.client.id,
      contractId: contract.id,
      installationId: ctx.installation.id,
      notes:
        "Reserva creada tras firma del pre-contrato y pendiente de selección de método de pago",
      paymentDeadlineAt,
      reservedKwp: ctx.assignedKwp,
      studyId: ctx.study.id,
    },
  );

  if (!reservation?.id) {
    throw internalServerError("La reserva se creó pero no devolvió id");
  }

  await deps.repositories.reservations.update(reservation.id, {
    currency,
    metadata: {
      installation_iban_aportaciones: bankAccountIban,
      payment_method: null,
      payment_method_selected_at: null,
      payment_options_available: ["stripe", "bank_transfer"],
      reservation_amount_source: reservationAmountSource,
      reservation_mode: reservationMode,
    },
    signal_amount: signalAmount,
  });

  const nowIso = new Date().toISOString();
  const updatedContract = await deps.repositories.contracts.update(contract.id, {
    contract_drive_file_id: uploadedContract.id,
    contract_drive_url: uploadedContract.webViewLink,
    drive_folder_id: contractsFolders.folder.id,
    drive_folder_url: contractsFolders.folder.webViewLink,
    metadata: {
      ...(contract.metadata ?? {}),
      assigned_kwp: ctx.assignedKwp,
      currency,
      installation_iban_aportaciones: bankAccountIban,
      payment_deadline_at: paymentDeadlineAt,
      payment_method: null,
      payment_status: "pending",
      payment_step: "pending_method_selection",
      reservation_amount_source: reservationAmountSource,
      reservation_created: true,
      reservation_id: reservation.id,
      reservation_mode: reservationMode,
      reservation_status: "pending_payment",
      signal_amount: signalAmount,
    },
    signed_at: nowIso,
    status: "uploaded",
    uploaded_at: nowIso,
  });

  return {
    contract: updatedContract,
    drive: {
      contractFileUrl: uploadedContract.webViewLink,
      contractFolderUrl: contractsFolders.folder.webViewLink,
      contractsRootFolderUrl: contractsFolders.root.webViewLink,
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

  if (!ctx.client.email) {
    throw badRequest(
      "El cliente no tiene email para enviar las instrucciones de transferencia",
    );
  }

  if (!contract.contract_drive_file_id) {
    throw badRequest("El contrato no tiene PDF firmado asociado en Drive");
  }

  const bankAccountIban = resolveInstallationBankIban(
    ctx.installation,
    deps.env.sapiensBankAccountIban,
  );
  const currency = String(
    reservation.currency || contract?.metadata?.currency || "eur",
  )
    .trim()
    .toLowerCase();
  const paymentDeadlineAt =
    reservation.payment_deadline_at ??
    new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const precontractFile = await deps.services.drive.downloadFileAsBuffer(
    contract.contract_drive_file_id,
  );
  const transferConcept = `Reserva ${contract.contract_number}`;
  const nowIso = new Date().toISOString();

  await deps.services.mail.sendBankTransferReservationEmail({
    bankAccountIban,
    bankBeneficiary: "Sapiens Energía",
    clientName: `${ctx.client.nombre} ${ctx.client.apellidos}`.trim(),
    contractNumber: contract.contract_number,
    currency,
    installationName: ctx.installation.nombre_instalacion,
    language: ctx.language,
    paymentDeadlineAt,
    precontractPdfBuffer: precontractFile.buffer,
    precontractPdfFilename:
      precontractFile.fileName || `PRECONTRATO_${contract.contract_number}.pdf`,
    reservedKwp: Number(reservation.reserved_kwp ?? ctx.assignedKwp ?? 0),
    signalAmount,
    to: ctx.client.email,
    transferConcept,
  });

  await deps.repositories.reservations.update(reservation.id, {
    currency,
    metadata: {
      ...(reservation.metadata ?? {}),
      bank_account_iban: bankAccountIban,
      bank_transfer_email_sent_at: nowIso,
      payment_method: "bank_transfer",
      payment_method_selected_at: nowIso,
      reservation_amount_source: reservationAmountSource,
      reservation_mode: reservationMode,
      transfer_concept: transferConcept,
    },
    signal_amount: signalAmount,
  });

  const updatedContract = await deps.repositories.contracts.update(contract.id, {
    metadata: {
      ...(contract.metadata ?? {}),
      bank_account_iban: bankAccountIban,
      bank_transfer_email_sent_at: nowIso,
      currency,
      payment_method: "bank_transfer",
      payment_method_selected_at: nowIso,
      payment_step: "awaiting_bank_transfer",
      reservation_amount_source: reservationAmountSource,
      reservation_mode: reservationMode,
      signal_amount: signalAmount,
      transfer_concept: transferConcept,
    },
  });

  return {
    bankTransfer: {
      beneficiary: "Sapiens Energía",
      concept: transferConcept,
      emailSentTo: ctx.client.email,
      iban: bankAccountIban,
      paymentDeadlineAt,
    },
    contract: {
      contractNumber: updatedContract.contract_number,
      id: updatedContract.id,
      status: updatedContract.status,
    },
    message:
      "Método de pago seleccionado correctamente. Se ha enviado un email con las instrucciones de transferencia bancaria.",
    reservation: {
      currency,
      id: reservation.id,
      paymentDeadlineAt,
      paymentMethod: "bank_transfer",
      paymentStatus: reservation.payment_status ?? "pending",
      reservationAmountSource,
      reservationMode,
      reservationStatus: reservation.reservation_status ?? "pending_payment",
      signalAmount,
    },
    success: true,
  };
}
