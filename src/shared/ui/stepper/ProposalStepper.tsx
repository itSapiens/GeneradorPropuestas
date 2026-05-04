import { Check, FileText, MapPin, Upload, Zap } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/src/shared/lib/utils";
import type { Step } from "@/src/entities/proposal/domain/proposal.types";
import { TFunction } from "i18next";

type ProposalStepperProps = {
  currentStep: Step;
  t: TFunction;
};

export default function ProposalStepper({
  currentStep,
  t,
}: ProposalStepperProps) {
  const steps = [
    { key: "upload", label: t("steps.upload"), icon: Upload },
    { key: "validation", label: t("steps.validation"), icon: FileText },
    { key: "map", label: t("steps.location"), icon: MapPin },
    { key: "result", label: t("steps.result"), icon: Zap },
  ] as const;

  const currentVisualStep = currentStep === "calculation" ? "map" : currentStep;
  const currentIndex = steps.findIndex((step) => step.key === currentVisualStep);

  return (
    <div className="mb-12 md:mb-20 relative px-4">
      <div className="absolute top-1/2 left-0 w-full h-1 bg-brand-navy/5 -translate-y-1/2 rounded-full" />

      <div className="relative flex justify-between items-center">
        {steps.map((step, i) => {
          const isActive = i <= currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <div
              key={step.key}
              className="flex flex-col items-center gap-3 md:gap-4 relative z-10"
            >
              <div
                className={cn(
                  "w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center transition-all duration-700 shadow-lg",
                  isActive
                    ? "brand-gradient text-brand-navy scale-110 shadow-brand-mint/20"
                    : "bg-[#F8FAFC] border-2 border-brand-navy/5 text-brand-navy/20",
                )}
              >
                {isActive && i < currentIndex ? (
                  <Check className="w-5 h-5 md:w-7 md:h-7" />
                ) : (
                  <step.icon className="w-5 h-5 md:w-7 md:h-7" />
                )}
              </div>

              <span
                className={cn(
                  "text-[8px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-bold transition-colors duration-500",
                  isActive ? "text-brand-navy" : "text-brand-navy/20",
                  !isCurrent && "hidden md:block",
                )}
              >
                {step.label}
              </span>

              {isCurrent && (
                <motion.div
                  layoutId="stepper-glow"
                  className="absolute -inset-3 md:-inset-4 brand-gradient opacity-20 blur-xl md:blur-2xl rounded-full -z-10"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}