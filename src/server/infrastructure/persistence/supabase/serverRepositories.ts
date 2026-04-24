import { supabase } from "../../clients/supabaseClient";

export const serverRepositories = {
  accessTokens: {
    async create(payload: Record<string, any>) {
      const { error } = await supabase.from("contract_access_tokens").insert(payload);

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
    async findByDni(dni: string) {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("dni", dni)
        .maybeSingle();

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
      const { data, error } = await supabase
        .from("clients")
        .upsert(payload, { onConflict: "dni" })
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
      const { data, error } = await supabase
        .from("contracts")
        .insert([payload])
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

      if (error) {
        throw new Error(error.message);
      }

      return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
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
      const { data, error } = await supabase
        .from("studies")
        .insert([payload])
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
      const { data, error } = await supabase
        .from("studies")
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
};
