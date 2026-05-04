import { motion } from "motion/react";
import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/src/shared/lib/utils";
import { ResultStepProps } from "./ResultStepInterfaces";
import ProposalModeCard from "./ProposalModeCard";
import ResultActionsCard from "./ResultActionsCard";

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
        <div className="absolute top-0 right-0 w-56 h-56 md:w-80 md:h-80 bg-[#F8FAFC]/10 blur-3xl rounded-full -mr-20 -mt-20" />

        <div className="relative z-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_430px] gap-6">
          {/* IZQUIERDA */}
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-[#F8FAFC]/25 border border-white/20 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-navy">
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
              <div className="inline-flex w-full rounded-[1.25rem] bg-[#F8FAFC]/35 p-1.5 backdrop-blur-xl border border-white/30 shadow-lg shadow-brand-navy/5">
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
              <div className="rounded-[1.3rem] bg-[#F8FAFC]/35 backdrop-blur-xl border border-white/25 p-4 shadow-md shadow-brand-navy/5">
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

            <div className="rounded-[1.6rem] bg-[#F8FAFC]/20 border border-white/20 backdrop-blur-xl p-4 md:p-5 shadow-lg shadow-brand-navy/5">
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
                <div className="rounded-[1.4rem] bg-[#F8FAFC]/35 border border-white/25 p-4">
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
                      className="rounded-[1.2rem] bg-[#F8FAFC]/35 backdrop-blur-xl border border-white/25 p-3.5 shadow-md shadow-brand-navy/5"
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
              className="relative overflow-hidden rounded-[1.9rem] border border-white/30 bg-[#F8FAFC]/26 p-6 text-[#000054] shadow-xl backdrop-blur-xl min-h-[210px]"
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
                  ? "cursor-not-allowed border-white/20 bg-[#F8FAFC]/20 opacity-70"
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
                  <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-[#000054]/10 bg-[#F8FAFC]/70 px-5 py-2 text-sm font-bold text-[#000054]">
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
        {visibleProposalPanels.map((proposal) => (
          <ProposalModeCard
            key={proposal.id}
            proposal={proposal}
            t={t}
            formatCurrency={formatCurrency}
            formatNumber={formatNumber}
            normalizeFeatureList={normalizeFeatureList}
          />
        ))}

        <ResultActionsCard
          t={t}
          activeProposal={activeProposal}
          signedContractResult={signedContractResult}
          savedStudy={savedStudy}
          isGeneratingContract={isGeneratingContract}
          isSigningContract={isSigningContract}
          contractAlreadySigned={contractAlreadySigned}
          reserveButtonText={reserveButtonText}
          handleGenerateContract={handleGenerateContract}
          handleDownloadPDF={handleDownloadPDF}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
        />
      </div>
    </motion.div>
  );
}
