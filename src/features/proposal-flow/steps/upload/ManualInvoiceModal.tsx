import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { FilePenLine, X } from "lucide-react";
import { motion } from "motion/react";
import type { TFunction } from "i18next";
import z from "zod";

import {
  ValidationBillDataSchema,
} from "@/src/entities/proposal/domain/proposal.rules";
import type {
  ValidationBillData,
  ValidationBillDataFormInput,
} from "@/src/entities/proposal/domain/proposal.types";
import { optionalNumberField } from "@/src/features/proposal-flow/lib/proposalNumbers";
import type { ManualInvoiceData } from "@/src/features/proposal-flow/lib/manualInvoiceData";
import Button from "@/src/shared/ui/button/Button";
import Input from "@/src/shared/ui/input/Input";
import { cn } from "@/src/shared/lib/utils";

const ManualInvoiceSchema = ValidationBillDataSchema.extend({
  invoiceVariableEnergyAmountEur: optionalNumberField,
});

type ManualInvoiceFormInput = ValidationBillDataFormInput & {
  invoiceVariableEnergyAmountEur?: unknown;
};

type ManualInvoiceFormOutput = ValidationBillData & {
  invoiceVariableEnergyAmountEur?: number;
};

type ManualInvoiceModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ManualInvoiceData) => void;
  t: TFunction;
};

const periodKeys = ["P1", "P2", "P3", "P4", "P5", "P6"] as const;

export default function ManualInvoiceModal({
  open,
  onClose,
  onSubmit,
  t,
}: ManualInvoiceModalProps) {
  const schema = useMemo(() => ManualInvoiceSchema, []);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ManualInvoiceFormInput, unknown, ManualInvoiceFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      billType: "2TD",
    },
  });

  if (!open) return null;

  const submit = handleSubmit((data) => {
    onSubmit(data);
    reset({ billType: "2TD" });
  });

  const close = () => {
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 px-4 py-8 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-invoice-title"
    >
      <motion.div
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/30 bg-white p-6 shadow-2xl md:p-8"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
      >
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-navy/5 text-brand-navy">
              <FilePenLine className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                Alt + Shift + A
              </p>
              <h2
                id="manual-invoice-title"
                className="mt-1 text-2xl font-bold text-brand-navy"
              >
                {t(
                  "manualInvoice.title",
                  "Introducir datos de factura manualmente",
                )}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-brand-gray">
                {t(
                  "manualInvoice.description",
                  "Rellena los datos mínimos que usa el cálculo cuando la factura no se lee bien. Después podrás revisar el titular y continuar igual que con una extracción automática.",
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-brand-navy/40 transition-colors hover:bg-brand-navy/5 hover:text-brand-navy"
            aria-label={t("common.close", "Cerrar")}
            title={t("common.close", "Cerrar")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-8">
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-brand-navy">
                {t("manualInvoice.customerSection", "Cliente y suministro")}
              </h3>
              <p className="text-sm text-brand-gray">
                {t(
                  "manualInvoice.customerHint",
                  "Son los datos necesarios para identificar el estudio y generar la propuesta.",
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input
                label={t("fields.name", "Nombre")}
                {...register("name")}
                error={errors.name?.message}
              />
              <Input
                label={t("fields.lastName", "Apellidos")}
                {...register("lastName")}
                error={errors.lastName?.message}
              />
              <Input
                label={t("fields.dni", "DNI / NIF")}
                {...register("dni")}
                error={errors.dni?.message}
              />
              <Input
                label="CUPS"
                {...register("cups")}
                error={errors.cups?.message}
              />
              <Input
                label={t("fields.email", "Email")}
                {...register("email")}
                error={errors.email?.message}
              />
              <Input
                label={t("fields.phone", "Teléfono")}
                {...register("phone")}
                error={errors.phone?.message}
              />
              <Input
                label="IBAN"
                {...register("iban")}
                error={errors.iban?.message}
                placeholder="ES00 0000 0000 0000 0000 0000"
              />
              <Input
                label={t("fields.address", "Dirección completa")}
                {...register("address")}
                error={errors.address?.message}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-brand-navy">
                {t("manualInvoice.invoiceSection", "Datos para el cálculo")}
              </h3>
              <p className="text-sm text-brand-gray">
                {t(
                  "manualInvoice.invoiceHint",
                  "El consumo medio mensual y el precio real de energía son los campos que más pesan en el estudio.",
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="w-full flex flex-col gap-1.5">
                <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-black/40">
                  {t("manualInvoice.billType", "Tarifa")}
                </label>
                <Controller
                  name="billType"
                  control={control}
                  render={({ field }) => (
                    <select
                      value={field.value ?? "2TD"}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      className={cn(
                        "w-full rounded-xl border border-brand-navy/10 bg-[#F8FAFC] px-4 py-3 text-sm transition-all duration-200 focus:border-brand-sky focus:outline-none focus:ring-2 focus:ring-brand-sky/20",
                        errors.billType?.message &&
                          "border-red-500 focus:border-red-500 focus:ring-red-500/20",
                      )}
                    >
                      <option value="2TD">2TD</option>
                      <option value="3TD">3TD</option>
                    </select>
                  )}
                />
                {errors.billType?.message ? (
                  <p className="ml-1 text-[10px] font-medium text-red-500">
                    {errors.billType.message}
                  </p>
                ) : null}
              </div>

              <Input
                label={t(
                  "manualInvoice.monthlyConsumption",
                  "Consumo medio mensual (kWh)",
                )}
                inputMode="decimal"
                {...register("monthlyConsumption")}
                error={errors.monthlyConsumption?.message}
              />
              <Input
                label={t(
                  "manualInvoice.invoiceConsumption",
                  "Consumo factura (kWh)",
                )}
                inputMode="decimal"
                {...register("currentInvoiceConsumptionKwh")}
                error={errors.currentInvoiceConsumptionKwh?.message}
              />
              <Input
                label={t("manualInvoice.billedDays", "Días facturados")}
                inputMode="numeric"
                {...register("billedDays")}
                error={errors.billedDays?.message}
              />
              <Input
                label={t(
                  "manualInvoice.variableEnergyAmount",
                  "Importe energía (€)",
                )}
                inputMode="decimal"
                {...register("invoiceVariableEnergyAmountEur")}
                error={errors.invoiceVariableEnergyAmountEur?.message}
              />
              <Input
                label={t("manualInvoice.totalAmount", "Importe total (€)")}
                inputMode="decimal"
                {...register("invoiceTotalAmountEur")}
                error={errors.invoiceTotalAmountEur?.message}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-brand-navy">
                {t("manualInvoice.periodSection", "Periodos")}
              </h3>
              <p className="text-sm text-brand-gray">
                {t(
                  "manualInvoice.periodHint",
                  "Si tienes consumos y precios por periodo, el cálculo ajustará mejor el precio medio de la factura.",
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {periodKeys.map((period) => {
                const consumptionField =
                  `periodConsumption${period}` as keyof ManualInvoiceFormInput;
                const priceField =
                  `periodPrice${period}` as keyof ManualInvoiceFormInput;

                return (
                  <div
                    key={period}
                    className="grid grid-cols-2 gap-3 rounded-2xl border border-brand-navy/10 bg-[#F8FAFC] p-4"
                  >
                    <Input
                      label={`${period} kWh`}
                      inputMode="decimal"
                      {...register(consumptionField as any)}
                      error={(errors as any)[consumptionField]?.message}
                    />
                    <Input
                      label={`${period} €/kWh`}
                      inputMode="decimal"
                      {...register(priceField as any)}
                      error={(errors as any)[priceField]?.message}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-brand-navy">
                {t("manualInvoice.powerSection", "Potencia contratada")}
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <Input
                label="Potencia P1 (kW)"
                inputMode="decimal"
                {...register("contractedPowerP1")}
                error={errors.contractedPowerP1?.message}
              />
              <Input
                label="Potencia P2 (kW)"
                inputMode="decimal"
                {...register("contractedPowerP2")}
                error={errors.contractedPowerP2?.message}
              />
              <Input
                label={t(
                  "manualInvoice.contractedPowerText",
                  "Texto potencia",
                )}
                {...register("contractedPowerText")}
                error={errors.contractedPowerText?.message}
                placeholder="P1 37 kW · P2 37 kW"
              />
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 border-t border-brand-navy/10 pt-6 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={close}>
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button type="submit" className="px-8">
              {t("manualInvoice.continue", "Continuar con estos datos")}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
