import { createServerDependencies } from "../server/infrastructure/serverDependencies";
import { supabase } from "../server/infrastructure/clients/supabaseClient";
import {
  regularizeSignedContractBankTransferUseCase,
  resendSignedContractBankTransferEmailUseCase,
} from "../server/application/use-cases/contractUseCases";

type ContractCandidate = {
  client_id?: string | null;
  contract_drive_file_id?: string | null;
  contract_number?: string | null;
  contract_supabase_path?: string | null;
  confirmed_at?: string | null;
  id: string;
  metadata?: Record<string, any> | null;
  signed_at?: string | null;
  status?: string | null;
  study_id?: string | null;
  uploaded_at?: string | null;
};

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const resend = args.includes("--resend") || args.includes("--force-resend");
const resendPaid =
  args.includes("--resend-paid") || args.includes("--force-resend-paid");
const includeExcluded = args.includes("--include-excluded");
const contractIdArg = args.find((arg) => arg.startsWith("--contract-id="));
const contractNumberArg = args.find((arg) =>
  arg.startsWith("--contract-number="),
);
const contractRefArg = args.find((arg) => arg.startsWith("--contract="));
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const recentDaysArg = args.find((arg) => arg.startsWith("--recent-days="));
const sinceArg = args.find((arg) => arg.startsWith("--since="));
const excludeArg = args.find((arg) => arg.startsWith("--exclude="));
const toArg = args.find((arg) => arg.startsWith("--to="));
const contractRef =
  contractIdArg?.split("=")[1]?.trim() ||
  contractNumberArg?.split("=")[1]?.trim() ||
  contractRefArg?.split("=")[1]?.trim() ||
  null;
const limit = Math.max(1, Number(limitArg?.split("=")[1] || 500));
const recentDays = Number(recentDaysArg?.split("=")[1] || 0);
const since = sinceArg?.split("=")[1]?.trim() || null;
const recipientEmailOverride = toArg?.split("=")[1]?.trim() || null;
const defaultExcludedAssociations = ["fllorisheredia", "tecnicoit01"];
const excludedAssociations = [
  ...defaultExcludedAssociations,
  ...(excludeArg
    ?.split("=")[1]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? []),
].map((value) => value.toLowerCase());

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getMetadata(contract: ContractCandidate) {
  return contract.metadata && typeof contract.metadata === "object"
    ? contract.metadata
    : {};
}

function associatedValuesMatchExcluded(values: Array<string | null | undefined>) {
  return values.some((value) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    return (
      normalized &&
      excludedAssociations.some((excluded) => normalized.includes(excluded))
    );
  });
}

async function getContractAssociations(contract: ContractCandidate) {
  const associations = {
    clientEmail: null as string | null,
    clientName: null as string | null,
    studyCustomerEmail: null as string | null,
    studyCustomerName: null as string | null,
  };

  if (contract.client_id) {
    const { data: client, error } = await supabase
      .from("clients")
      .select("email,nombre,apellidos")
      .eq("id", contract.client_id)
      .maybeSingle();

    if (error) throw error;

    if (client) {
      associations.clientEmail = client.email ?? null;
      associations.clientName = [client.nombre, client.apellidos]
        .filter(Boolean)
        .join(" ");
    }
  }

  if (contract.study_id) {
    const { data: study, error } = await supabase
      .from("studies")
      .select("customer")
      .eq("id", contract.study_id)
      .maybeSingle();

    if (error) throw error;

    if (study?.customer && typeof study.customer === "object") {
      const customer = study.customer as Record<string, any>;
      associations.studyCustomerEmail = customer.email ?? null;
      associations.studyCustomerName = [customer.nombre, customer.apellidos]
        .filter(Boolean)
        .join(" ");
    }
  }

  return associations;
}

async function getLinkedReservation(contract: ContractCandidate) {
  const metadata = getMetadata(contract);

  if (contract.id) {
    const { data, error } = await supabase
      .from("installation_reservations")
      .select("*")
      .eq("contract_id", contract.id)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (metadata.reservation_id) {
    const { data, error } = await supabase
      .from("installation_reservations")
      .select("*")
      .eq("id", metadata.reservation_id)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

function isReservationCompleted(reservation: any) {
  const paymentStatus = String(reservation?.payment_status ?? "")
    .trim()
    .toLowerCase();
  const reservationStatus = String(reservation?.reservation_status ?? "")
    .trim()
    .toLowerCase();

  return (
    paymentStatus === "signal_paid" ||
    paymentStatus === "paid" ||
    reservationStatus === "paid" ||
    reservationStatus === "confirmed"
  );
}

function hasSignedPdf(contract: ContractCandidate) {
  const metadata = getMetadata(contract);

  return Boolean(
    contract.contract_supabase_path ||
      contract.contract_drive_file_id ||
      metadata.contract_supabase_path ||
      metadata.contract_drive_file_id,
  );
}

function isRegularizationCandidate(contract: ContractCandidate) {
  return getRegularizationSkipReason(contract, {
    allowExistingInstructions: resend,
  }) === null;
}

function getRegularizationSkipReason(
  contract: ContractCandidate,
  options?: {
    allowExistingInstructions?: boolean;
  },
) {
  const metadata = getMetadata(contract);
  const status = String(contract.status ?? "").trim().toLowerCase();
  const paymentMethod = String(metadata.payment_method ?? "")
    .trim()
    .toLowerCase();
  const paymentFlowStatus = String(metadata.payment_flow_status ?? "")
    .trim()
    .toLowerCase();
  const instructionsSentCount = Number(
    metadata.payment_instructions_sent_count ?? 0,
  );
  const hasInstructions =
    Boolean(metadata.payment_instructions_sent_at) ||
    (Number.isFinite(instructionsSentCount) && instructionsSentCount > 0);

  if (!contract.signed_at) return "no esta firmado";
  if (status === "confirmed") return "contrato confirmado";
  if (paymentFlowStatus === "payment_confirmed") return "pago confirmado";
  if (paymentMethod === "stripe") return "tiene pago por Stripe";
  if (hasInstructions && !options?.allowExistingInstructions) {
    return "ya tiene instrucciones enviadas";
  }
  if (!hasSignedPdf(contract)) return "no tiene PDF firmado asociado";

  return null;
}

async function loadContracts() {
  if (contractRef) {
    const column = isUuid(contractRef) ? "id" : "contract_number";
    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq(column, contractRef)
      .maybeSingle();

    if (error) throw error;
    return data ? [data as ContractCandidate] : [];
  }

  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .not("signed_at", "is", null)
    .order("signed_at", { ascending: false });

  if (error) throw error;

  let contracts = (data ?? []) as ContractCandidate[];

  if (since) {
    const sinceTime = new Date(since).getTime();
    if (Number.isFinite(sinceTime)) {
      contracts = contracts.filter((contract) => {
        const signedTime = new Date(contract.signed_at ?? "").getTime();
        return Number.isFinite(signedTime) && signedTime >= sinceTime;
      });
    }
  }

  if (recentDays > 0) {
    const minTime = Date.now() - recentDays * 24 * 60 * 60 * 1000;
    contracts = contracts.filter((contract) => {
      const signedTime = new Date(contract.signed_at ?? "").getTime();
      return Number.isFinite(signedTime) && signedTime >= minTime;
    });
  }

  return contracts;
}

async function main() {
  const deps = createServerDependencies();
  const contracts = await loadContracts();
  const candidatesWithAssociations = [];

  if (contractRef && contracts.length === 0) {
    console.error(`No se encontro ningun contrato con id/numero: ${contractRef}`);
    process.exitCode = 1;
    return;
  }

  for (const contract of contracts.filter(isRegularizationCandidate)) {
    const associations = await getContractAssociations(contract);
    const reservation = await getLinkedReservation(contract);
    const excluded = associatedValuesMatchExcluded([
      associations.clientEmail,
      associations.clientName,
      associations.studyCustomerEmail,
      associations.studyCustomerName,
    ]);

    if (isReservationCompleted(reservation) && !resendPaid) {
      console.warn(
        `Excluido por reserva ya pagada: ${
          contract.contract_number ?? contract.id
        } email=${associations.clientEmail ?? associations.studyCustomerEmail ?? "-"}`,
      );
      continue;
    }

    if (excluded && !includeExcluded) {
      console.warn(
        `Excluido por asociacion interna: ${
          contract.contract_number ?? contract.id
        } email=${associations.clientEmail ?? associations.studyCustomerEmail ?? "-"}`,
      );
      continue;
    }

    candidatesWithAssociations.push({
      associations,
      contract,
    });

    if (candidatesWithAssociations.length >= limit) {
      break;
    }
  }

  if (contractRef && candidatesWithAssociations.length === 0) {
    const contract = contracts[0];
    const associations = await getContractAssociations(contract);
    const reservation = await getLinkedReservation(contract);
    const excluded = associatedValuesMatchExcluded([
      associations.clientEmail,
      associations.clientName,
      associations.studyCustomerEmail,
      associations.studyCustomerName,
    ]);
    console.error(
      `Contrato encontrado pero no procesable: ${
        contract.contract_number ?? contract.id
      } (${
        excluded && !includeExcluded
          ? "excluido por asociacion interna; usa --include-excluded para probar"
          :
        getRegularizationSkipReason(contract, {
          allowExistingInstructions: resend,
        }) ??
        (isReservationCompleted(reservation) && !resendPaid
          ? "la reserva ya esta pagada"
          : "motivo desconocido")
      })`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `${execute ? "Ejecucion real" : "Dry-run"}: ${candidatesWithAssociations.length} contrato(s) firmados pendientes de instrucciones.`,
  );

  if (!execute) {
    for (const { associations, contract } of candidatesWithAssociations) {
      console.log(
        `[dry-run] ${contract.contract_number ?? "-"} ${contract.id} email=${
          associations.clientEmail ?? associations.studyCustomerEmail ?? "-"
        } firmado=${contract.signed_at}`,
      );
    }

    console.log("Vuelve a ejecutar con --execute para enviar los emails.");
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const { associations, contract } of candidatesWithAssociations) {
    try {
      const reservation = await getLinkedReservation(contract);
      const result =
        resendPaid && isReservationCompleted(reservation)
          ? await resendSignedContractBankTransferEmailUseCase(
              deps,
              contract.id,
              {
                recipientEmailOverride,
              },
            )
          : await regularizeSignedContractBankTransferUseCase(
              deps,
              contract.id,
              {
                forceSendInstructions: resend,
                recipientEmailOverride,
              },
            );

      console.log(
        `OK ${contract.contract_number ?? contract.id} email=${
          recipientEmailOverride ??
          associations.clientEmail ??
          associations.studyCustomerEmail ??
          "-"
        }: ${result.message ?? "regularizado"}`,
      );
      if ("error" in result && result.error) {
        console.error(`EMAIL_ERROR ${contract.contract_number ?? contract.id}: ${result.error}`);
      }
      sent += result.success ? 1 : 0;
    } catch (error: any) {
      failed += 1;
      console.error(
        `ERROR ${contract.contract_number ?? contract.id}: ${
          error?.message ?? "error desconocido"
        }`,
      );
    }
  }

  console.log(`Terminado. Regularizados: ${sent}. Errores: ${failed}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
