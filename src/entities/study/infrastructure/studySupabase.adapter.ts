import { supabase } from "@/src/shared/lib/supabase/supabaseClient";
import type { StudyRow } from "@/src/shared/lib/supabase/supabaseClientType";

export interface CreateStudyPayload {
  language?: string;
  consent_accepted?: boolean;
  source_file?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  location?: Record<string, unknown> | null;
  invoice_data?: Record<string, unknown> | null;
  selected_installation_id?: string | null;
  selected_installation_snapshot?: Record<string, unknown> | null;
  calculation?: Record<string, unknown> | null;
  status?: string;
  email_status?: string;
}

export async function createStudy(payload: CreateStudyPayload): Promise<StudyRow> {
  const { data, error } = await supabase
    .from("studies")
    .insert({
      language: payload.language ?? "ES",
      consent_accepted: payload.consent_accepted ?? false,
      source_file: payload.source_file ?? null,
      customer: payload.customer ?? null,
      location: payload.location ?? null,
      invoice_data: payload.invoice_data ?? null,
      selected_installation_id: payload.selected_installation_id ?? null,
      selected_installation_snapshot:
        payload.selected_installation_snapshot ?? null,
      calculation: payload.calculation ?? null,
      status: payload.status ?? "uploaded",
      email_status: payload.email_status ?? "pending",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error creando estudio: ${error.message}`);
  }

  return data as StudyRow;
}

export async function getStudyById(id: string): Promise<StudyRow | null> {
  const { data, error } = await supabase
    .from("studies")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Error obteniendo estudio: ${error.message}`);
  }

  return data as StudyRow;
}

export async function updateStudy(
  id: string,
  payload: Partial<Omit<StudyRow, "id" | "created_at" | "updated_at">>,
): Promise<StudyRow> {
  const { data, error } = await supabase
    .from("studies")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Error actualizando estudio: ${error.message}`);
  }

  return data as StudyRow;
}

export async function listStudies(): Promise<StudyRow[]> {
  const { data, error } = await supabase
    .from("studies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error listando estudios: ${error.message}`);
  }

  return (data ?? []) as StudyRow[];
}
