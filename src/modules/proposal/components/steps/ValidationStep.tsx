import { Controller, type Control, type FieldErrors, type UseFormHandleSubmit, type UseFormRegister } from "react-hook-form";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { TFunction } from "i18next";

import { PlacesAutocompleteInput } from "@/src/components/shared/PlacesAutocompleteInput";
import Button from "@/src/components/ui/Button";
import Input from "@/src/components/ui/Input";
import { cn } from "@/src/lib/utils";
import { FormSection } from "../types/SormSection";
import { ValidationBillData, ValidationBillDataFormInput } from "../types/proposal.types";

type ValidationStepProps = {
  register: UseFormRegister<ValidationBillDataFormInput>;
  control: Control<ValidationBillDataFormInput, unknown>;
  handleSubmit: UseFormHandleSubmit<ValidationBillDataFormInput, ValidationBillData>;
  errors: FieldErrors<ValidationBillDataFormInput>;
  onSubmit: (data: ValidationBillData) => void;
  onAddressSelected: (place: {
    formattedAddress: string;
    lat: number;
    lng: number;
  }) => void;
  t: TFunction;
};

export default function ValidationStep({
  register,
  control,
  handleSubmit,
  errors,
  onSubmit,
  onAddressSelected,
  t,
}: ValidationStepProps) {
  return (
    <motion.div
      key="validation"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="max-w-5xl mx-auto"
    >
      <div className="mb-12 text-center">
        <h2 className="text-4xl font-bold mb-4">{t("validation.title")}</h2>
        <p className="text-brand-gray">{t("validation.description")}</p>
      </div>

      <div className="bg-white rounded-[2.5rem] p-10 border border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
          <FormSection
            title={t("validation.ownerSection.title")}
            subtitle={t("validation.ownerSection.subtitle")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Input
                label={t("fields.name")}
                {...register("name")}
                error={errors.name?.message}
                placeholder={t("placeholders.name")}
              />

              <Input
                label={t("fields.lastName")}
                {...register("lastName")}
                error={errors.lastName?.message}
                placeholder={t("placeholders.lastName")}
              />

              <Input
                label={t("fields.dni")}
                {...register("dni")}
                error={errors.dni?.message}
                placeholder={t("placeholders.dni")}
              />

              <Input
                label={t("fields.email")}
                {...register("email")}
                error={errors.email?.message}
                placeholder={t("placeholders.email")}
              />

              <Input
                label={t("fields.phone")}
                {...register("phone")}
                error={errors.phone?.message}
                placeholder={t("placeholders.phone")}
              />

              <div className="w-full flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/40 uppercase tracking-wider ml-1">
                  {t("fields.address")}
                </label>

                <Controller
                  name="address"
                  control={control}
                  render={({ field }) => (
                    <PlacesAutocompleteInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      onPlaceSelected={(place) => {
                        field.onChange(place.formattedAddress);
                        onAddressSelected(place);
                      }}
                      placeholder={t("placeholders.address")}
                      id="address"
                      name="address"
                      inputClassName={cn(
                        "w-full px-4 py-3 rounded-xl border border-brand-navy/10 bg-white text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-sky/20 focus:border-brand-sky placeholder:text-brand-navy/20",
                        errors.address?.message &&
                          "border-red-500 focus:ring-red-500/20 focus:border-red-500",
                      )}
                    />
                  )}
                />

                {errors.address?.message && (
                  <p className="text-[10px] font-medium text-red-500 ml-1">
                    {errors.address.message}
                  </p>
                )}
              </div>
            </div>
          </FormSection>

          <div className="flex justify-center pt-4">
            <Button
              type="submit"
              size="lg"
              className="w-full md:w-auto px-12 py-7 text-lg rounded-2xl"
            >
              {t("common.confirmAndContinue")}
              <ArrowRight className="ml-3 w-5 h-5" />
            </Button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}