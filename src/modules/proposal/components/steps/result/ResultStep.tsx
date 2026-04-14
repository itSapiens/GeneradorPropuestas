import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import Button from "@/src/components/ui/Button";
import { ResultStepProps } from "./ResultStepInterfaces";

// import { Button } from "@/components/ui/button";
// // ajusta esta ruta si tu cn está en otro sitio
// import { cn } from "@/lib/utils";


export function ResultStep({
  t,
  proposalResults,
  hasMultipleProposalModes,
  activeProposal,
  activeProposalMode,
  setSelectedProposalView,
  topActiveMetrics,
  featuredResumeCard,
  visibleProposalPanels,
  savedStudy,
  isGeneratingContract,
  isSigningContract,
  contractAlreadySigned,
  reserveCardTitle,
  reserveCardDescription,
  activeModeLabelLower,
  reserveButtonText,
  signedContractResult,
  handleGenerateContract,
  handleDownloadPDF,
  formatCurrency,
  formatNumber,
  normalizeFeatureList,
}: ResultStepProps) {
  if (!proposalResults) return null;

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 md:space-y-8"
    >
      {/* BLOQUE SUPERIOR */}
      <div className="rounded-[2rem] md:rounded-[3rem] brand-gradient p-5 md:p-8 shadow-2xl shadow-brand-mint/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-56 h-56 md:w-80 md:h-80 bg-white/10 blur-3xl rounded-full -mr-20 -mt-20" />

        <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_430px] gap-6">
          {/* IZQUIERDA */}
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-white/25 border border-white/20 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-navy">
                <Icon
                  icon="solar:check-circle-bold-duotone"
                  className="h-4 w-4"
                />
                {t("result.badge")}
              </div>

              <div>
                <h2 className="text-3xl md:text-5xl font-bold text-brand-navy leading-tight">
                  {t("result.hero.titleLine1")}
                  <br />
                  {t("result.hero.titleLine2")}{" "}
                </h2>

                <p className="mt-3 text-sm md:text-base text-brand-navy/70 max-w-2xl leading-relaxed">
                  {hasMultipleProposalModes
                    ? t("result.hero.compareDescription")
                    : activeProposal.id === "investment"
                      ? t("result.hero.singleModeInvestment")
                      : t("result.hero.singleModeService")}
                </p>
              </div>
            </div>

            {hasMultipleProposalModes ? (
              <div className="inline-flex w-full rounded-[1.25rem] bg-white/35 p-1.5 backdrop-blur-xl border border-white/30 shadow-lg shadow-brand-navy/5">
                <button
                  type="button"
                  onClick={() => setSelectedProposalView("investment")}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                    activeProposalMode === "investment"
                      ? "bg-brand-navy text-white shadow-md"
                      : "text-brand-navy/70 hover:text-brand-navy",
                  )}
                >
                  <Icon
                    icon="solar:wallet-money-bold-duotone"
                    className="h-5 w-5"
                  />
                  {t("result.modes.investment")}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedProposalView("service")}
                  className={cn(
                    "flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                    activeProposalMode === "service"
                      ? "bg-brand-navy text-white shadow-md"
                      : "text-brand-navy/70 hover:text-brand-navy",
                  )}
                >
                  <Icon
                    icon="solar:bolt-bold-duotone"
                    className="h-5 w-5"
                  />
                  {t("result.modes.service")}{" "}
                </button>
              </div>
            ) : (
              <div className="rounded-[1.3rem] bg-white/35 backdrop-blur-xl border border-white/25 p-4 shadow-md shadow-brand-navy/5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-brand-navy text-white flex items-center justify-center">
                    <Icon
                      icon={
                        activeProposal.id === "investment"
                          ? "solar:wallet-money-bold-duotone"
                          : "solar:bolt-bold-duotone"
                      }
                      className="h-5 w-5"
                    />
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-brand-navy/40">
                      {t("result.availableMode")}
                    </p>
                    <p className="text-base md:text-lg font-bold text-brand-navy">
                      {activeProposal.title}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-[1.6rem] bg-white/20 border border-white/20 backdrop-blur-xl p-4 md:p-5 shadow-lg shadow-brand-navy/5">
              <div className="flex items-center gap-2 mb-4">
                <Icon
                  icon={
                    activeProposal.id === "investment"
                      ? "solar:wallet-money-bold-duotone"
                      : "solar:bolt-bold-duotone"
                  }
                  className="h-5 w-5 text-brand-navy"
                />
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/45">
                  {t("result.activeOption")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4 md:gap-5">
                <div className="rounded-[1.4rem] bg-white/35 border border-white/25 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-brand-navy/40">
                    {t("result.selectedMode")}{" "}
                  </p>
                  <p className="mt-2 text-2xl md:text-3xl font-bold text-brand-navy">
                    {activeProposal.title}
                  </p>
                  <p className="mt-3 text-sm text-brand-navy/65 leading-relaxed">
                    {activeProposal.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {topActiveMetrics.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[1.2rem] bg-white/35 backdrop-blur-xl border border-white/25 p-3.5 shadow-md shadow-brand-navy/5"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon
                          icon={item.icon}
                          className="h-4 w-4 text-brand-navy/70"
                        />
                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-brand-navy/40">
                          {item.label}
                        </p>
                      </div>

                      <p className="text-sm md:text-lg font-bold text-brand-navy leading-tight">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* DERECHA */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="relative overflow-hidden rounded-[1.9rem] border border-white/30 bg-white/26 p-6 text-[#000054] shadow-xl backdrop-blur-xl min-h-[210px]"
            >
              <motion.div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(84,217,199,0.14),transparent_30%)]"
                animate={{ opacity: [0.75, 0.92, 0.75] }}
                transition={{
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              <motion.div
                className="pointer-events-none absolute -top-10 left-[-30%] h-[160%] w-16 rotate-[18deg] bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ left: ["-30%", "115%"] }}
                transition={{
                  duration: 4.8,
                  repeat: Infinity,
                  repeatDelay: 3.2,
                  ease: "easeInOut",
                }}
              />

              <div className="relative z-10 h-full flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#94C2FF]/20">
                    <Icon
                      icon={featuredResumeCard.icon}
                      className="h-5 w-5 text-[#000054]"
                    />
                  </div>

                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#706F6F]">
                    {featuredResumeCard.label}
                  </p>
                </div>

                <div className="mt-6">
                  <motion.p
                    animate={{ y: [0, -1.5, 0] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="text-4xl md:text-5xl font-bold leading-tight text-[#000054]"
                  >
                    {featuredResumeCard.value}
                  </motion.p>

                  {"helper" in featuredResumeCard && featuredResumeCard.helper ? (
                    <p className="mt-3 text-base text-[#706F6F]">
                      {featuredResumeCard.helper}
                    </p>
                  ) : (
                    <p className="mt-3 text-base text-[#706F6F]">
                      Estimado a largo plazo según la modalidad seleccionada.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            <motion.button
              type="button"
              onClick={handleGenerateContract}
              disabled={
                !savedStudy?.study?.id ||
                isGeneratingContract ||
                isSigningContract ||
                contractAlreadySigned
              }
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: 0.05,
                ease: "easeOut",
              }}
              whileHover={
                contractAlreadySigned
                  ? undefined
                  : { y: -1.5, scale: 1.008 }
              }
              whileTap={
                contractAlreadySigned ? undefined : { scale: 0.992 }
              }
              className={cn(
                "group relative w-full min-h-[210px] overflow-hidden rounded-[1.9rem] border p-6 text-left shadow-xl transition-all backdrop-blur-xl",
                contractAlreadySigned
                  ? "cursor-not-allowed border-white/20 bg-white/20 opacity-70"
                  : "border-white/30 bg-[linear-gradient(135deg,rgba(0,0,84,0.98),rgba(28,78,216,0.88))] hover:shadow-[0_18px_45px_rgba(0,0,84,0.22)]",
              )}
            >
              {!contractAlreadySigned ? (
                <>
                  <motion.div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.20),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.12),transparent_35%)]"
                    animate={{ opacity: [0.82, 0.96, 0.82] }}
                    transition={{
                      duration: 4.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />

                  <motion.div
                    className="pointer-events-none absolute -top-10 left-[-32%] h-[180%] w-16 rotate-[18deg] bg-gradient-to-r from-transparent via-white/22 to-transparent"
                    animate={{ left: ["-32%", "118%"] }}
                    transition={{
                      duration: 5.2,
                      repeat: Infinity,
                      repeatDelay: 3.5,
                      ease: "easeInOut",
                    }}
                  />
                </>
              ) : null}

              <div className="relative z-10 h-full flex flex-col justify-center items-center text-center">
                <motion.div
                  animate={
                    contractAlreadySigned
                      ? {}
                      : {
                          y: [0, -1.5, 0],
                        }
                  }
                  transition={{
                    duration: 3.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="mb-5 flex h-16 w-16 items-center justify-center rounded-[1.3rem] bg-brand-mint text-shadow-brand-navy shadow-[0_10px_28px_rgba(0,0,84,0.18)]"
                >
                  {isGeneratingContract ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : contractAlreadySigned ? (
                    <Icon
                      icon="solar:shield-check-bold-duotone"
                      className="h-8 w-8"
                    />
                  ) : (
                    <Icon
                      icon="solar:pen-new-square-bold-duotone"
                      className="h-8 w-8"
                    />
                  )}
                </motion.div>

                <p className="text-3xl md:text-[2rem] font-bold text-[#ffffff]">
                  {reserveCardTitle}
                </p>

                <p className="mt-3 max-w-sm text-base leading-relaxed text-[#ffff]/78">
                  {reserveCardDescription}
                </p>

                {!contractAlreadySigned ? (
                  <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-[#000054]/10 bg-white/70 px-5 py-2 text-sm font-bold text-[#000054]">
                    {`Continuar con ${activeModeLabelLower}`}
                    <motion.span
                      animate={{ x: [0, 2, 0] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      →
                    </motion.span>
                  </div>
                ) : null}
              </div>
            </motion.button>
          </div>
        </div>
      </div>

      {/* BLOQUE INFERIOR */}
      <div
        className={cn(
          "grid gap-6 md:gap-8 items-stretch",
          visibleProposalPanels.length === 2
            ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px]"
            : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px]",
        )}
      >
        {visibleProposalPanels.map((proposal) => {
          const isInvestment = proposal.id === "investment";
          const normalizedValuePoints = normalizeFeatureList(
            proposal.valuePoints,
            4,
          );

          return (
            <div
              key={proposal.id}
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
                    isInvestment
                      ? "bg-white/10 text-white"
                      : "bg-brand-mint/10 text-brand-navy",
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
                        isInvestment
                          ? "text-white/50"
                          : "text-brand-navy/40",
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
                        isInvestment
                          ? "text-white/50"
                          : "text-brand-navy/40",
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
                        isInvestment
                          ? "text-white/50"
                          : "text-brand-navy/40",
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
        })}

        {/* ACCIONES */}
        <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white border border-brand-navy/5 shadow-2xl shadow-brand-navy/5 p-5 md:p-6 flex flex-col gap-5 xl:min-h-[520px]">
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
      </div>
    </motion.div>
  );
}