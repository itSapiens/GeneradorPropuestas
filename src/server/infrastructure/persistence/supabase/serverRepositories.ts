import { supabase } from "../../clients/supabaseClient";

const clientColumnSupportPromises = new Map<string, Promise<boolean>>();
const accessTokenColumnSupportPromises = new Map<string, Promise<boolean>>();
const contractColumnSupportPromises = new Map<string, Promise<boolean>>();
const reservationColumnSupportPromises = new Map<string, Promise<boolean>>();
const studyColumnSupportPromises = new Map<string, Promise<boolean>>();

async function clientSupportsColumn(columnName: string) {
  const cached = clientColumnSupportPromises.get(columnName);

  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    const { error } = await supabase
      .from("clients")
      .select(columnName)
      .limit(1);

    return !error;
  })();

  clientColumnSupportPromises.set(columnName, lookup);

  return lookup;
}

async function clientsSupportsEmpresaId() {
  return clientSupportsColumn("empresa_id");
}

async function clientsSupportsBic() {
  return clientSupportsColumn("bic");
}

async function accessTokenSupportsColumn(columnName: string) {
  const cached = accessTokenColumnSupportPromises.get(columnName);

  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    const { error } = await supabase
      .from("contract_access_tokens")
      .select(columnName)
      .limit(1);

    return !error;
  })();

  accessTokenColumnSupportPromises.set(columnName, lookup);

  return lookup;
}

async function accessTokensSupportEmpresaId() {
  return accessTokenSupportsColumn("empresa_id");
}

async function contractSupportsColumn(columnName: string) {
  const cached = contractColumnSupportPromises.get(columnName);

  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    const { error } = await supabase
      .from("contracts")
      .select(columnName)
      .limit(1);

    return !error;
  })();

  contractColumnSupportPromises.set(columnName, lookup);

  return lookup;
}

async function contractsSupportEmpresaId() {
  return contractSupportsColumn("empresa_id");
}

async function reservationSupportsColumn(columnName: string) {
  const cached = reservationColumnSupportPromises.get(columnName);

  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    const { error } = await supabase
      .from("installation_reservations")
      .select(columnName)
      .limit(1);

    return !error;
  })();

  reservationColumnSupportPromises.set(columnName, lookup);

  return lookup;
}

async function reservationsSupportContractId() {
  return reservationSupportsColumn("contract_id");
}

async function reservationsSupportEmpresaId() {
  return reservationSupportsColumn("empresa_id");
}

async function reservationsSupportNotes() {
  return reservationSupportsColumn("notes");
}

async function reservationsSupportNotas() {
  return reservationSupportsColumn("notas");
}

async function studySupportsColumn(columnName: string) {
  const cached = studyColumnSupportPromises.get(columnName);

  if (cached) {
    return cached;
  }

  const lookup = (async () => {
    const { error } = await supabase
      .from("studies")
      .select(columnName)
      .limit(1);

    return !error;
  })();

  studyColumnSupportPromises.set(columnName, lookup);

  return lookup;
}

async function sanitizeStudiesPayload(payload: Record<string, any>) {
  const [
    supportsEmpresaId,
    supportsConsentAccepted,
    supportsLanguage,
    supportsLocation,
  ] = await Promise.all([
    studySupportsColumn("empresa_id"),
    studySupportsColumn("consent_accepted"),
    studySupportsColumn("language"),
    studySupportsColumn("location"),
  ]);

  const sanitizedPayload = { ...payload };

  if (!supportsEmpresaId) {
    delete sanitizedPayload.empresa_id;
  }

  if (!supportsConsentAccepted) {
    delete sanitizedPayload.consent_accepted;
  }

  if (!supportsLanguage) {
    delete sanitizedPayload.language;
  }

  if (!supportsLocation) {
    delete sanitizedPayload.location;
  }

  return sanitizedPayload;
}

export const serverRepositories = {
  accessTokens: {
    async create(payload: Record<string, any>) {
      const supportsEmpresaId = await accessTokensSupportEmpresaId();
      const sanitizedPayload = { ...payload };

      if (supportsEmpresaId) {
        if (!sanitizedPayload.empresa_id) {
          throw new Error(
            "No se puede guardar el token de acceso sin empresa_id",
          );
        }
      } else {
        delete sanitizedPayload.empresa_id;
      }

      const { error } = await supabase
        .from("contract_access_tokens")
        .insert(sanitizedPayload);

      if (error) {
        throw new Error(error.message);
      }
    },
    async findProposalContinueByHash(tokenHash: string) {
      const { data, error } = await supabase
        .from("contract_access_tokens")
        .select("*")
        .eq("token_hash", tokenHash)
        .eq("purpose", "proposal_continue")
        .is("revoked_at", null)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },
    async revokeActiveProposalContinueTokens(payload: {
      clientId: string;
      studyId: string;
    }) {
      const { error } = await supabase
        .from("contract_access_tokens")
        .update({
          revoked_at: new Date().toISOString(),
        })
        .eq("study_id", payload.studyId)
        .eq("client_id", payload.clientId)
        .eq("purpose", "proposal_continue")
        .is("used_at", null)
        .is("revoked_at", null);

      if (error) {
        throw new Error(error.message);
      }
    },
  },
  clients: {
    async findByDni(params: { empresaId?: string | null; dni: string }) {
      const supportsEmpresaId = await clientsSupportsEmpresaId();

      let query = supabase.from("clients").select("*").eq("dni", params.dni);

      if (supportsEmpresaId && params.empresaId) {
        query = query.eq("empresa_id", params.empresaId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },

    async findById(id: string) {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },

    async upsert(payload: Record<string, any>) {
      if (!payload.dni) {
        throw new Error("No se puede guardar el cliente sin dni");
      }

      const supportsEmpresaId = await clientsSupportsEmpresaId();
      const supportsBic = await clientsSupportsBic();
      const sanitizedPayload = { ...payload };

      if (supportsEmpresaId) {
        if (!sanitizedPayload.empresa_id) {
          throw new Error("No se puede guardar el cliente sin empresa_id");
        }
      } else {
        delete sanitizedPayload.empresa_id;
      }

      if (!supportsBic) {
        delete sanitizedPayload.bic;
      }

      const { data, error } = await supabase
        .from("clients")
        .upsert(sanitizedPayload, {
          onConflict: supportsEmpresaId ? "empresa_id,dni" : "dni",
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
  },
  contracts: {
    async create(payload: Record<string, any>) {
      const supportsEmpresaId = await contractsSupportEmpresaId();
      const sanitizedPayload = { ...payload };

      if (supportsEmpresaId) {
        if (!sanitizedPayload.empresa_id) {
          throw new Error("No se puede guardar el contrato sin empresa_id");
        }
      } else {
        delete sanitizedPayload.empresa_id;
      }

      const { data, error } = await supabase
        .from("contracts")
        .insert([sanitizedPayload])
        .select()
        .single();

      if (error) {
        const wrapped = new Error(error.message);
        (wrapped as any).code = error.code;
        throw wrapped;
      }

      return data;
    },
    async findById(id: string) {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },
    async findByStudyId(studyId: string) {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("study_id", studyId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },
    async update(id: string, payload: Record<string, any>) {
      const { data, error } = await supabase
        .from("contracts")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
  },
  installations: {
    async findActive() {
      const { data, error } = await supabase
        .from("installations")
        .select("*")
        .eq("active", true)
        .order("nombre_instalacion", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
    async findById(id: string) {
      const { data, error } = await supabase
        .from("installations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },
  },
  reservations: {
    async confirmPayment(payload: {
      reservationId: string;
      stripeCheckoutSessionId: string;
      stripePaymentIntentId?: string | null;
    }) {
      const { error } = await supabase.rpc(
        "confirm_installation_reservation_payment",
        {
          p_reservation_id: payload.reservationId,
          p_stripe_checkout_session_id: payload.stripeCheckoutSessionId,
          p_stripe_payment_intent_id: payload.stripePaymentIntentId ?? null,
        },
      );

      if (error) {
        throw new Error(error.message);
      }
    },
    async createPendingReservation(payload: {
      clientId: string;
      contractId: string;
      installationId: string;
      notes: string;
      paymentDeadlineAt: string;
      reservedKwp: number;
      studyId: string;
    }) {
      const { data, error } = await supabase.rpc("reserve_installation_kwp", {
        p_installation_id: payload.installationId,
        p_study_id: payload.studyId,
        p_client_id: payload.clientId,
        p_contract_id: payload.contractId,
        p_reserved_kwp: payload.reservedKwp,
        p_payment_deadline_at: payload.paymentDeadlineAt,
        p_deadline_enforced: false,
        p_notes: payload.notes,
      });

      if (!error) {
        return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
      }

      console.error("[reservations.createPendingReservation] RPC failed", {
        code: error.code ?? null,
        details: (error as any).details ?? null,
        hint: (error as any).hint ?? null,
        message: error.message,
      });

      const installation = await serverRepositories.installations.findById(
        payload.installationId,
      );

      if (!installation) {
        throw new Error(
          `No se encontró la instalación ${payload.installationId} para crear la reserva`,
        );
      }

      const contractableTotal = Number(
        installation.contractable_kwp_total ?? Number.POSITIVE_INFINITY,
      );
      const contractableReserved = Number(
        installation.contractable_kwp_reserved ?? 0,
      );
      const contractableConfirmed = Number(
        installation.contractable_kwp_confirmed ?? 0,
      );
      const requestedKwp = Number(payload.reservedKwp ?? 0);

      if (
        Number.isFinite(contractableTotal) &&
        contractableReserved + contractableConfirmed + requestedKwp >
          contractableTotal + 1e-9
      ) {
        throw new Error(
          "No hay potencia disponible suficiente para reservar esta instalación",
        );
      }

      const [
        supportsContractId,
        supportsEmpresaId,
        supportsNotas,
        supportsNotes,
      ] = await Promise.all([
        reservationsSupportContractId(),
        reservationsSupportEmpresaId(),
        reservationsSupportNotas(),
        reservationsSupportNotes(),
      ]);

      const insertPayload: Record<string, any> = {
        client_id: payload.clientId,
        currency: "eur",
        deadline_enforced: false,
        installation_id: payload.installationId,
        metadata: {},
        payment_deadline_at: payload.paymentDeadlineAt,
        payment_status: "pending",
        reservation_status: "pending_payment",
        reserved_kwp: requestedKwp,
        study_id: payload.studyId,
      };

      if (supportsContractId) {
        insertPayload.contract_id = payload.contractId;
      }

      if (supportsEmpresaId) {
        if (!installation.empresa_id) {
          throw new Error(
            "La instalación seleccionada no tiene empresa_id para crear la reserva",
          );
        }

        insertPayload.empresa_id = installation.empresa_id;
      }

      if (supportsNotas) {
        insertPayload.notas = payload.notes;
      }

      if (supportsNotes) {
        insertPayload.notes = payload.notes;
      }

      const { data: insertedReservation, error: insertError } = await supabase
        .from("installation_reservations")
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      const updatedReservedKwp = contractableReserved + requestedKwp;
      const { error: installationUpdateError } = await supabase
        .from("installations")
        .update({
          contractable_kwp_reserved: updatedReservedKwp,
        })
        .eq("id", payload.installationId);

      if (installationUpdateError) {
        throw new Error(installationUpdateError.message);
      }

      return insertedReservation ?? null;
    },
    async findByContractId(contractId: string) {
      const { data, error } = await supabase
        .from("installation_reservations")
        .select("*")
        .eq("contract_id", contractId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },
    async findById(id: string) {
      const { data, error } = await supabase
        .from("installation_reservations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },
    async releaseReservation(payload: {
      paymentStatus: string;
      reason: string;
      reservationId: string;
    }) {
      const { error } = await supabase.rpc("release_installation_reservation", {
        p_payment_status: payload.paymentStatus,
        p_release_reason: payload.reason,
        p_reservation_id: payload.reservationId,
      });

      if (error) {
        throw new Error(error.message);
      }
    },
    async update(id: string, payload: Record<string, any>) {
      const { error } = await supabase
        .from("installation_reservations")
        .update(payload)
        .eq("id", id);

      if (error) {
        throw new Error(error.message);
      }
    },
  },
  studies: {
    async create(payload: Record<string, any>) {
      const sanitizedPayload = await sanitizeStudiesPayload(payload);

      const { data, error } = await supabase
        .from("studies")
        .insert([sanitizedPayload])
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    async findById(id: string) {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? null;
    },
    async update(id: string, payload: Record<string, any>) {
      const sanitizedPayload = await sanitizeStudiesPayload(payload);

      const { data, error } = await supabase
        .from("studies")
        .update(sanitizedPayload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
  },
};
