import type { BillData } from "@/src/shared/lib/validators";

export function mapBillDataToClientPayload(data: BillData) {
  return {
    address: data.address,
    dni: data.dni,
    email: data.email,
    iban: data.iban,
    lastName: data.lastName,
    name: data.name,
    phone: data.phone,
  };
}
