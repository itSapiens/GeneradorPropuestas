import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import Button from "@/src/shared/ui/button/Button";
import { cn } from "@/src/shared/lib/utils";
import type {
  Proposal,
  SignedContractResult,
} from "./ResultStepInterfaces";

interface ResultActionsCardProps {
  t: (key: string) => string;
  activeProposal: Proposal;
  signedContractResult?: SignedContractResult | null;
  savedStudy: any;
  isGeneratingContract: boolean;
  isSigningContract: boolean;
  contractAlreadySigned: boolean;
  reserveButtonText: string;
  handleGenerateContract: () => void;
  handleDownloadPDF: () => void;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
}

export default function ResultActionsCard({
  t,
  activeProposal,
  signedContractResult,
  savedStudy,
  isGeneratingContract,
  isSigningContract,
  contractAlreadySigned,
  reserveButtonText,
  handleGenerateContract,
  handleDownloadPDF,
  formatCurrency,
  formatNumber,
}: ResultActionsCardProps) {
  return (
    <div className="rounded-[2rem] md:rounded-[2.5rem] bg-[#F8FAFC] border border-brand-navy/5 shadow-2xl shadow-brand-navy/5 p-5 md:p-6 flex flex-col gap-5 xl:min-h-[520px]">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/40">
          {t("result.actions.title")}
        </p>
      </div>

      <div className="rounded-[1.4rem] bg-brand-navy text-white p-4 border border-brand-navy">
        <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/50">
          {t("result.actions.youWillHire")}
        </p>

        <p className="mt-3 text-2xl font-bold">{activeProposal.title}</p>

        <div className="mt-4 space-y-2 text-sm text-white/75">
          <p>
            {t("result.actions.mode")}:{" "}
            <span className="font-bold text-white">
              {activeProposal.title}
            </span>
          </p>

          <p>
            {t("result.summary.annualSavings")}:{" "}
            <span className="font-bold text-white">
              {formatCurrency(activeProposal.annualSavings)}
            </span>
          </p>

          <p>
            {activeProposal.id === "investment" ? (
              <>
                {t("result.summary.initialCost")}:{" "}
                <span className="font-bold text-white">
                  {formatCurrency(activeProposal.upfrontCost)}
                </span>
              </>
            ) : activeProposal.monthlyFee && activeProposal.monthlyFee > 0 ? (
              <>
                {t("result.summary.monthlyFee")}:{" "}
                <span className="font-bold text-white">
                  {formatNumber(activeProposal.monthlyFee)} € /{" "}
                  {t("result.units.month")}
                </span>
              </>
            ) : (
              t("result.summary.noFee")
            )}
          </p>

          <p>
            {t("result.actions.power")}:{" "}
            <span className="font-bold text-white">
              {formatNumber(activeProposal.recommendedPowerKwp)} kWp
            </span>
          </p>
        </div>
      </div>

      {signedContractResult?.reservation ? (
        <div className="rounded-[1.4rem] bg-brand-mint/10 border border-brand-mint/20 p-4 text-brand-navy">
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/50">
            {t("result.reserve.startedTitle")}
          </p>

          <div className="mt-3 space-y-2 text-sm leading-relaxed">
            <p>
              <span className="font-bold">
                {signedContractResult.reservation.reservedKwp} kWp
              </span>{" "}
              {t("result.actions.reservedIn")}{" "}
              <span className="font-bold">
                {signedContractResult.reservation.installationName}
              </span>
              .
            </p>

            <p>
              {t("result.actions.paymentStatus")}:{" "}
              <span className="font-bold">
                {signedContractResult.reservation.paymentStatus}
              </span>
            </p>

            <p>
              {t("result.actions.pendingSignal")}:{" "}
              <span className="font-bold">
                {formatCurrency(signedContractResult.reservation.signalAmount)}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-auto space-y-3">
        <Button
          className={cn(
            "w-full py-5 rounded-[1.2rem] border-none",
            contractAlreadySigned
              ? "bg-brand-navy/10 text-brand-navy/50 cursor-not-allowed"
              : "bg-brand-mint text-brand-navy hover:bg-brand-mint/90",
          )}
          onClick={handleGenerateContract}
          disabled={
            !savedStudy?.study?.id ||
            isGeneratingContract ||
            isSigningContract ||
            contractAlreadySigned
          }
        >
          <span className="inline-flex items-center justify-center">
            <span className="mr-3 inline-flex h-6 w-6 items-center justify-center">
              {isGeneratingContract ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : contractAlreadySigned ? (
                <Icon
                  icon="solar:shield-check-bold-duotone"
                  className="h-6 w-6"
                />
              ) : (
                <Icon
                  icon="solar:pen-new-square-bold-duotone"
                  className="h-6 w-6"
                />
              )}
            </span>
            <span>{reserveButtonText}</span>
          </span>
        </Button>

        <Button
          className="w-full py-5 rounded-[1.2rem] brand-gradient text-brand-navy border-none"
          onClick={handleDownloadPDF}
        >
          <Icon
            icon="solar:download-minimalistic-bold-duotone"
            className="mr-3 h-6 w-6"
          />
          {t("common.downloadPdf")}
        </Button>
      </div>
    </div>
  );
}
