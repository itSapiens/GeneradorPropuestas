import { supabase } from "@/src/shared/lib/supabase/supabaseClient";
import type { InstallationRow } from "@/src/shared/lib/supabase/supabaseClientType";

export async function getActiveInstallations(): Promise<InstallationRow[]> {
  const { data, error } = await supabase
    .from("installations")
    .select("*")
    .eq("active", true)
    .order("nombre_instalacion", { ascending: true });

  if (error) {
    throw new Error(`Error obteniendo instalaciones: ${error.message}`);
  }

  return (data ?? []) as InstallationRow[];
}

export async function getInstallationById(
  id: string,
): Promise<InstallationRow | null> {
  const { data, error } = await supabase
    .from("installations")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Error obteniendo instalación: ${error.message}`);
  }

  return data as InstallationRow;
}

export async function createInstallation(
  payload: Omit<InstallationRow, "id" | "created_at" | "updated_at">,
): Promise<InstallationRow> {
  const { data, error } = await supabase
    .from("installations")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(`Error creando instalación: ${error.message}`);
  }

  return data as InstallationRow;
}

export async function updateInstallation(
  id: string,
  payload: Partial<Omit<InstallationRow, "id" | "created_at" | "updated_at">>,
): Promise<InstallationRow> {
  const { data, error } = await supabase
    .from("installations")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Error actualizando instalación: ${error.message}`);
  }

  return data as InstallationRow;
}

export async function deactivateInstallation(id: string): Promise<void> {
  const { error } = await supabase
    .from("installations")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    throw new Error(`Error desactivando instalación: ${error.message}`);
  }
}
