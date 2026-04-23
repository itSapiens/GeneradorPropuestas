import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Thermometer, Car, TrendingUp, X } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";

export interface ExtraConsumptionSelections {
  hvac: boolean;
  ev: boolean;
  hvacSquareMeters: number | null;
  evAnnualKm: number | null;
}

export const EMPTY_EXTRA_CONSUMPTION: ExtraConsumptionSelections = {
  hvac: false,
  ev: false,
  hvacSquareMeters: null,
  evAnnualKm: null,
};

/**
 * Consumo eléctrico anual por m² para bomba de calor aerotérmica
 * (calefacción + refrigeración combinadas). Referencia IDAE zonas B-D España.
 */
export const HVAC_KWH_PER_M2_YEAR = 22.5;

/**
 * Consumo eléctrico por km para coche eléctrico incluyendo pérdidas de carga.
 * 17 kWh/100km media mercado + 10% pérdidas wallbox AC → 0.187 kWh/km.
 */
export const EV_KWH_PER_KM = 0.187;

export function calculateExtraMonthlyConsumption(
  s: ExtraConsumptionSelections,
): number {
  let annualKwh = 0;
  if (s.hvac && s.hvacSquareMeters && s.hvacSquareMeters > 0) {
    annualKwh += s.hvacSquareMeters * HVAC_KWH_PER_M2_YEAR;
  }
  if (s.ev && s.evAnnualKm && s.evAnnualKm > 0) {
    annualKwh += s.evAnnualKm * EV_KWH_PER_KM;
  }
  return annualKwh / 12;
}

interface Props {
  open: boolean;
  onConfirm: (selections: ExtraConsumptionSelections) => void;
  onSkip: () => void;
  /** react-i18next TFunction — acepta cualquier firma de t() */
  t: any;
}

export default function ExtraConsumptionModal({
  open,
  onConfirm,
  onSkip,
  t,
}: Props) {
  const [step, setStep] = useState<"question" | "options">("question");
  const [hvacChecked, setHvacChecked] = useState(false);
  const [evChecked, setEvChecked] = useState(false);
  const [hvacM2, setHvacM2] = useState("");
  const [evKm, setEvKm] = useState("");
  const [errors, setErrors] = useState<{ hvac?: string; ev?: string }>({});

  const resetState = () => {
    setStep("question");
    setHvacChecked(false);
    setEvChecked(false);
    setHvacM2("");
    setEvKm("");
    setErrors({});
  };

  const handleSkip = () => {
    resetState();
    onSkip();
  };

  const handleYes = () => {
    setStep("options");
  };

  const handleConfirm = () => {
    const newErrors: { hvac?: string; ev?: string } = {};

    if (hvacChecked) {
      const m2 = Number(hvacM2);
      if (!hvacM2 || !Number.isFinite(m2) || m2 < 10 || m2 > 1000) {
        newErrors.hvac = t(
          "extraConsumption.errors.invalidM2",
          "Introduce un valor entre 10 y 1000 m²",
        );
      }
    }

    if (evChecked) {
      const km = Number(evKm);
      if (!evKm || !Number.isFinite(km) || km < 500 || km > 200000) {
        newErrors.ev = t(
          "extraConsumption.errors.invalidKm",
          "Introduce un valor entre 500 y 200.000 km",
        );
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!hvacChecked && !evChecked) {
      handleSkip();
      return;
    }

    const selections: ExtraConsumptionSelections = {
      hvac: hvacChecked,
      ev: evChecked,
      hvacSquareMeters: hvacChecked ? Number(hvacM2) : null,
      evAnnualKm: evChecked ? Number(evKm) : null,
    };

    const extraMonthly = calculateExtraMonthlyConsumption(selections);

    resetState();
    onConfirm(selections);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] bg-brand-navy/50 backdrop-blur-sm overflow-y-auto"
        >
          <div className="min-h-full px-4 pt-20 pb-6 md:pt-24 md:pb-8 flex items-start justify-center">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-lg rounded-[2rem] md:rounded-[2.5rem] bg-[#F8FAFC] border border-brand-navy/5 shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 md:px-8 pt-8 pb-2 text-center relative">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl brand-gradient mb-5">
                  <TrendingUp className="w-8 h-8 text-brand-navy" />
                </div>

                <div className="inline-block px-3 py-1 rounded-full bg-brand-sky/10 text-brand-sky text-[10px] font-bold uppercase tracking-widest mb-4">
                  {t(
                    "extraConsumption.badge",
                    "Previsión de consumo",
                  )}
                </div>

                <h2 className="text-xl md:text-2xl font-bold text-brand-navy mb-2">
                  {t(
                    "extraConsumption.title",
                    "¿Tienes pensado incrementar tu consumo eléctrico?",
                  )}
                </h2>

                <p className="text-sm text-brand-gray leading-relaxed">
                  {t(
                    "extraConsumption.description",
                    "Si planeas instalar climatización o adquirir un coche eléctrico, podemos dimensionar tu instalación solar para cubrir también ese consumo futuro.",
                  )}
                </p>
              </div>

              {/* Body */}
              <div className="px-6 md:px-8 py-6">
                <AnimatePresence mode="wait">
                  {step === "question" ? (
                    <motion.div
                      key="question"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-3"
                    >
                      <Button
                        variant="outline"
                        className="w-full py-4 text-base font-bold rounded-2xl border-2 border-brand-navy/10 hover:border-brand-navy/30 text-brand-navy"
                        onClick={handleSkip}
                      >
                        {t("extraConsumption.no", "No, mi consumo será similar")}
                      </Button>

                      <Button
                        variant="primary"
                        className="w-full py-4 text-base font-bold rounded-2xl"
                        onClick={handleYes}
                      >
                        {t(
                          "extraConsumption.yes",
                          "Sí, quiero indicarlo",
                        )}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="options"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-4"
                    >
                      <p className="text-sm font-semibold text-brand-navy/60 mb-1">
                        {t(
                          "extraConsumption.selectOptions",
                          "Selecciona lo que tienes previsto:",
                        )}
                      </p>

                      {/* HVAC Card */}
                      <div
                        className={`rounded-2xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                          hvacChecked
                            ? "border-brand-sky bg-brand-sky/5 shadow-md shadow-brand-sky/10"
                            : "border-brand-navy/10 hover:border-brand-navy/20"
                        }`}
                        onClick={() => {
                          setHvacChecked(!hvacChecked);
                          if (hvacChecked) {
                            setHvacM2("");
                            setErrors((e) => ({ ...e, hvac: undefined }));
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                              hvacChecked
                                ? "bg-brand-sky text-white"
                                : "bg-brand-navy/5 text-brand-navy/40"
                            }`}
                          >
                            <Thermometer className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-brand-navy text-sm">
                              {t(
                                "extraConsumption.hvac.label",
                                "Climatización",
                              )}
                            </p>
                            <p className="text-xs text-brand-gray">
                              {t(
                                "extraConsumption.hvac.hint",
                                "Bomba de calor / aerotermia",
                              )}
                            </p>
                          </div>
                          <div
                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                              hvacChecked
                                ? "border-brand-sky bg-brand-sky"
                                : "border-brand-navy/20"
                            }`}
                          >
                            {hvacChecked && (
                              <svg
                                className="w-4 h-4 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>

                        <AnimatePresence>
                          {hvacChecked && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div
                                className="mt-4 pt-4 border-t border-brand-navy/5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <label className="block text-xs font-bold text-brand-navy/60 mb-2">
                                  {t(
                                    "extraConsumption.hvac.inputLabel",
                                    "Superficie de la vivienda (m²)",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  placeholder="90"
                                  min={10}
                                  max={1000}
                                  value={hvacM2}
                                  onChange={(e) => {
                                    setHvacM2(e.target.value);
                                    setErrors((prev) => ({
                                      ...prev,
                                      hvac: undefined,
                                    }));
                                  }}
                                />
                                {errors.hvac && (
                                  <p className="text-xs text-red-500 mt-1">
                                    {errors.hvac}
                                  </p>
                                )}
                                {hvacM2 && Number(hvacM2) > 0 && (
                                  <p className="text-xs text-brand-sky mt-2 font-semibold">
                                    +{Math.round((Number(hvacM2) * HVAC_KWH_PER_M2_YEAR) / 12)}{" "}
                                    kWh/mes estimados
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* EV Card */}
                      <div
                        className={`rounded-2xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                          evChecked
                            ? "border-brand-sky bg-brand-sky/5 shadow-md shadow-brand-sky/10"
                            : "border-brand-navy/10 hover:border-brand-navy/20"
                        }`}
                        onClick={() => {
                          setEvChecked(!evChecked);
                          if (evChecked) {
                            setEvKm("");
                            setErrors((e) => ({ ...e, ev: undefined }));
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                              evChecked
                                ? "bg-brand-sky text-white"
                                : "bg-brand-navy/5 text-brand-navy/40"
                            }`}
                          >
                            <Car className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-brand-navy text-sm">
                              {t(
                                "extraConsumption.ev.label",
                                "Coche eléctrico",
                              )}
                            </p>
                            <p className="text-xs text-brand-gray">
                              {t(
                                "extraConsumption.ev.hint",
                                "Carga doméstica con wallbox",
                              )}
                            </p>
                          </div>
                          <div
                            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                              evChecked
                                ? "border-brand-sky bg-brand-sky"
                                : "border-brand-navy/20"
                            }`}
                          >
                            {evChecked && (
                              <svg
                                className="w-4 h-4 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>

                        <AnimatePresence>
                          {evChecked && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div
                                className="mt-4 pt-4 border-t border-brand-navy/5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <label className="block text-xs font-bold text-brand-navy/60 mb-2">
                                  {t(
                                    "extraConsumption.ev.inputLabel",
                                    "Kilómetros anuales estimados",
                                  )}
                                </label>
                                <Input
                                  type="number"
                                  placeholder="12000"
                                  min={500}
                                  max={200000}
                                  value={evKm}
                                  onChange={(e) => {
                                    setEvKm(e.target.value);
                                    setErrors((prev) => ({
                                      ...prev,
                                      ev: undefined,
                                    }));
                                  }}
                                />
                                {errors.ev && (
                                  <p className="text-xs text-red-500 mt-1">
                                    {errors.ev}
                                  </p>
                                )}
                                {evKm && Number(evKm) > 0 && (
                                  <p className="text-xs text-brand-sky mt-2 font-semibold">
                                    +{Math.round((Number(evKm) * EV_KWH_PER_KM) / 12)}{" "}
                                    kWh/mes estimados
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Confirm */}
                      <Button
                        variant="primary"
                        className="w-full py-4 text-base font-bold rounded-2xl mt-2"
                        onClick={handleConfirm}
                      >
                        {t(
                          "extraConsumption.confirm",
                          "Continuar con el estudio",
                        )}
                      </Button>

                      <button
                        type="button"
                        className="text-xs text-brand-navy/40 hover:text-brand-navy/60 transition-colors text-center"
                        onClick={handleSkip}
                      >
                        {t(
                          "extraConsumption.skipLink",
                          "Omitir, no quiero indicar incremento",
                        )}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
