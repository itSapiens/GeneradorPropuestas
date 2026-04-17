import { supabase } from "../clients/supabaseClient";
import { normalizeAppLanguage } from "./contractLocalizationService";
import { toPositiveNumber } from "../utils/parsingUtils";
import { pickFirstString } from "../utils/stringUtils";

export async function getContractContextFromStudy(studyId: string) {
  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("*")
    .eq("id", studyId)
    .single();

  if (studyError || !study) {
    throw new Error("El estudio no existe");
  }

  const customer = study.customer ?? {};
  const clientDni =
    pickFirstString(customer?.dni, customer?.documentNumber) ?? null;

  if (!clientDni) {
    throw new Error("El estudio no tiene DNI de cliente");
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("dni", clientDni)
    .single();

  if (clientError || !client) {
    throw new Error("No se encontró el cliente asociado al estudio");
  }

  const installationId = study.selected_installation_id ?? null;

  if (!installationId) {
    throw new Error("El estudio no tiene instalación asignada");
  }

  const { data: installation, error: installationError } = await supabase
    .from("installations")
    .select("*")
    .eq("id", installationId)
    .single();

  if (installationError || !installation) {
    throw new Error("La instalación asociada al estudio no existe");
  }

  const assignedKwp =
    toPositiveNumber(study.assigned_kwp) ??
    toPositiveNumber(study?.calculation?.recommendedPowerKwp) ??
    toPositiveNumber(study?.selected_installation_snapshot?.assigned_kwp);

  if (assignedKwp === null) {
    throw new Error("El estudio no tiene assigned_kwp válido");
  }

  const language = normalizeAppLanguage(study.language);

  return {
    study,
    client,
    installation,
    assignedKwp,
    language,
  };
}
