import { Check, Zap } from "lucide-react";
import { motion } from "motion/react";
import type { TFunction } from "i18next";

type CalculationStepProps = {
  t: TFunction;
};

export default function CalculationStep({ t }: CalculationStepProps) {
  const tasks = [
    t("calculation.tasks.validateBill"),
    t("calculation.tasks.analyzeSolar"),
    t("calculation.tasks.calculateReturn"),
  ];

  return (
    <motion.div
      key="calculation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <div className="w-32 h-32 bg-white rounded-[2.5rem] shadow-2xl shadow-brand-navy/5 flex items-center justify-center mb-12 relative">
        <Zap className="w-12 h-12 text-brand-navy animate-pulse" />
        <div className="absolute -inset-4 border-4 border-brand-mint border-t-transparent rounded-[3rem] animate-spin" />
      </div>

      <h2 className="text-4xl font-bold mb-6">
        {t("calculation.titleLine1")} <br />
        <span className="brand-gradient-text">{t("calculation.titleLine2")}</span>
      </h2>

      <p className="text-brand-gray mb-12 max-w-sm mx-auto">
        Nuestros algoritmos están procesando miles de variables para ofrecerte el mejor resultado.
      </p>

      <div className="space-y-4 max-w-xs w-full">
        {tasks.map((text, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.5 }}
            className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-brand-navy/5 shadow-sm"
          >
            <div className="w-6 h-6 rounded-full brand-gradient flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 text-brand-navy" />
            </div>
            <span className="text-sm font-bold text-brand-navy/60">{text}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}