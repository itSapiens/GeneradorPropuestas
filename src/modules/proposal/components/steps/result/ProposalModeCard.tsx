import { Icon } from "@iconify/react";
import { cn } from "@/src/lib/utils";
import type { Proposal } from "./ResultStepInterfaces";

interface ProposalModeCardProps {
  proposal: Proposal;
  t: (key: string) => string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  normalizeFeatureList: (
    list: string[],
    targetLength: number,
  ) => (string | null)[];
}

export default function ProposalModeCard({
  proposal,
  t,
  formatCurrency,
  formatNumber,
  normalizeFeatureList,
}: ProposalModeCardProps) {
  const isInvestment = proposal.id === "investment";
  const normalizedValuePoints = normalizeFeatureList(proposal.valuePoints, 4);

  return (
    <div
      className={cn(
        "rounded-[2rem] md:rounded-[2.5rem] p-5 md:p-7 border min-h-[760px] h-full flex flex-col",
        isInvestment
          ? "bg-brand-navy text-white border-brand-navy shadow-2xl shadow-brand-navy/15"
          : "bg-white text-brand-navy border-brand-navy/5 shadow-2xl shadow-brand-navy/5",
      )}
    >
      <div className="space-y-4">
        <div
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
            isInvestment ? "bg-white/10 text-white" : "bg-brand-mint/10 text-brand-navy",
          )}
        >
          <Icon
            icon={
              isInvestment
                ? "solar:wallet-money-bold-duotone"
                : "solar:bolt-bold-duotone"
            }
            className="h-4 w-4"
          />
          {t("result.cards.mode")} {proposal.title.toLowerCase()}
        </div>

        <div>
          <h3 className="text-3xl font-bold">{proposal.title}</h3>
          <p
            className={cn(
              "mt-2 text-sm leading-relaxed",
              isInvestment ? "text-white/75" : "text-brand-gray",
            )}
          >
            {proposal.description}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-h-[132px]">
          <div
            className={cn(
              "rounded-[1.2rem] p-4 border h-[132px] flex flex-col justify-between",
              isInvestment
                ? "bg-white/10 border-white/10"
                : "bg-brand-navy/[0.03] border-brand-navy/5",
            )}
          >
            <p
              className={cn(
                "text-[10px] uppercase tracking-[0.14em] font-bold",
                isInvestment ? "text-white/50" : "text-brand-navy/40",
              )}
            >
              {t("result.summary.annualSavings")}
            </p>
            <p className="mt-2 text-lg font-bold">
              {formatCurrency(proposal.annualSavings)}
            </p>
          </div>

          <div
            className={cn(
              "rounded-[1.2rem] p-4 border h-[132px] flex flex-col justify-between",
              isInvestment
                ? "bg-white/10 border-white/10"
                : "bg-brand-navy/[0.03] border-brand-navy/5",
            )}
          >
            <p
              className={cn(
                "text-[10px] uppercase tracking-[0.14em] font-bold",
                isInvestment ? "text-white/50" : "text-brand-navy/40",
              )}
            >
              {isInvestment ? "Coste inicial" : "Cuota mensual"}
            </p>
            <p className="mt-2 text-lg font-bold">
              {isInvestment ? (
                formatCurrency(proposal.upfrontCost)
              ) : proposal.monthlyFee && proposal.monthlyFee > 0 ? (
                <>
                  {formatCurrency(proposal.monthlyFee)}
                  <span className="ml-1 text-xs font-semibold opacity-70">
                    / mes
                  </span>
                </>
              ) : (
                "Sin cuota"
              )}
            </p>
          </div>

          <div
            className={cn(
              "rounded-[1.2rem] p-4 border h-[132px] flex flex-col justify-between",
              isInvestment
                ? "bg-white/10 border-white/10"
                : "bg-brand-navy/[0.03] border-brand-navy/5",
            )}
          >
            <p
              className={cn(
                "text-[10px] uppercase tracking-[0.14em] font-bold",
                isInvestment ? "text-white/50" : "text-brand-navy/40",
              )}
            >
              {t("result.summary.monthlySavings")}{" "}
            </p>
            <p className="mt-2 text-lg font-bold">
              {formatCurrency(proposal.annualSavings / 12)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-rows-4 gap-3 min-h-[380px]">
        {normalizedValuePoints.map((point, index) => (
          <div
            key={`${proposal.id}-${index}`}
            className={cn(
              "rounded-[1.2rem] p-4 border h-[86px] flex items-center gap-3",
              point
                ? isInvestment
                  ? "bg-white/5 border-white/10"
                  : "bg-brand-navy/[0.03] border-brand-navy/5"
                : "bg-transparent border-transparent opacity-0 pointer-events-none",
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                isInvestment
                  ? "bg-white/10"
                  : "brand-gradient shadow-md shadow-brand-mint/20",
              )}
            >
              <Icon
                icon="solar:check-circle-bold-duotone"
                className={cn(
                  "h-5 w-5",
                  isInvestment ? "text-white" : "text-brand-navy",
                )}
              />
            </div>

            <p className="font-semibold text-sm md:text-base leading-snug">
              {point}
            </p>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "mt-auto pt-6 text-sm",
          isInvestment ? "text-white/70" : "text-brand-gray",
        )}
      >
        <p>
          {t("result.summary.recommendedPower")}:{" "}
          <span className="font-bold">
            {formatNumber(proposal.recommendedPowerKwp)} kWp
          </span>
        </p>
        <p className="mt-1">
          {t("result.summary.annualConsumptionEstimated")}:{" "}
          <span className="font-bold">
            {Math.round(proposal.annualConsumptionKwh)} kWh
          </span>
        </p>
      </div>
    </div>
  );
}
