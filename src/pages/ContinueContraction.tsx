import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { sileo } from "sileo";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  FileText,
  IdCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Wallet,
  Zap,
} from "lucide-react";

type ProposalMode = "investment" | "service";
type AppLanguage = "es" | "ca" | "val" | "gl";
type InstallationModalidad = "inversion" | "servicio" | "ambas";

type InstallationPreview = {
  id: string;
  nombre_instalacion: string;
  direccion: string | null;
  modalidad: InstallationModalidad;
  potencia_instalada_kwp?: number | null;
  horas_efectivas?: number | null;
  porcentaje_autoconsumo?: number | null;
  coste_kwh_inversion?: number | null;
  coste_kwh_servicio?: number | null;
  availableProposalModes: ProposalMode[];
  defaultProposalMode: ProposalMode;
};

type ProposalAccessPreviewResponse = {
  success: boolean;
  language?: AppLanguage;
  installation?: InstallationPreview;
  study?: {
    id: string;
    language?: AppLanguage;
    assigned_kwp?: number | null;
    calculation?: {
      // Ahorros anuales (campo real de CalculationResult)
      annualSavingsInvestment?: number | null;
      annualSavingsService?: number | null;
      // Campos legacy/compatibilidad (por si hay estudios guardados con nombre distinto)
      annualSavingsEuro?: number | null;
      estimatedAnnualSavingsEuro?: number | null;
      totalSavingsEuro?: number | null;
      // Coste de inversión / servicio
      investmentCost?: number | null;
      investmentTotal?: number | null;
      serviceCost?: number | null;
      serviceMonthlyFee?: number | null;
      monthlyFee?: number | null;
      // Potencia recomendada y precio €/kWh del cliente
      recommendedPowerKwp?: number | null;
      invoicePriceWithVatKwh?: number | null;
      weightedEnergyPriceKwh?: number | null;
    } | null;
  };
};

function normalizeAppLanguage(value?: string | null): AppLanguage {
  const lang = String(value || "")
    .trim()
    .toLowerCase();

  if (lang === "ca") return "ca";
  if (lang === "val") return "val";
  if (lang === "gl" || lang === "gal") return "gl";
  return "es";
}

function formatModeLabel(
  mode: ProposalMode,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return mode === "investment"
    ? t("result.modes.investment", "Inversión")
    : t("result.modes.service", "Servicio");
}

function formatInstallationModalidad(
  modalidad: InstallationModalidad,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (modalidad === "inversion") {
    return t("result.modes.investment", "Inversión");
  }

  if (modalidad === "servicio") {
    return t("result.modes.service", "Servicio");
  }

  return t(
    "continueContract.installation.bothModes",
    "Inversión y servicio",
  );
}
function formatCurrency(value: number, language: AppLanguage = "es") {
  const localeMap: Record<AppLanguage, string> = {
    es: "es-ES",
    ca: "ca-ES",
    val: "ca-ES",
    gl: "gl-ES",
  };

  return new Intl.NumberFormat(localeMap[language] || "es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}
export default function ContinuarContratacionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const langFromUrl = useMemo(
    () => normalizeAppLanguage(searchParams.get("lang")),
    [searchParams],
  );

  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [selectedMode, setSelectedMode] = useState<ProposalMode>("investment");
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [installationPreview, setInstallationPreview] =
    useState<InstallationPreview | null>(null);
  const [availableModes, setAvailableModes] = useState<ProposalMode[]>([]);
const [assignedKwp, setAssignedKwp] = useState<number | null>(null);
const [estimatedSavings, setEstimatedSavings] = useState<number | null>(null);
const [amountToPayInvestment, setAmountToPayInvestment] = useState<number | null>(null);
const [amountToPayService, setAmountToPayService] = useState<number | null>(null);
const [recommendedPowerKwp, setRecommendedPowerKwp] = useState<number | null>(null);
const [clientPriceKwh, setClientPriceKwh] = useState<number | null>(null);



  
  useEffect(() => {
    if (langFromUrl && i18n.language !== langFromUrl) {
      i18n.changeLanguage(langFromUrl);
    }
  }, [langFromUrl, i18n]);

  useEffect(() => {
    const loadPreview = async () => {
      if (!token) {
        setLoadingPreview(false);
        return;
      }

      try {
        const { data } = await axios.get<ProposalAccessPreviewResponse>(
          `/api/contracts/proposal-access/preview?token=${encodeURIComponent(token)}`,
        );

        if (!data?.success || !data?.installation) {
          throw new Error("No se pudo cargar la información de la instalación");
        }

        const resolvedLanguage = normalizeAppLanguage(
          data?.study?.language || data?.language || langFromUrl,
        );

        if (i18n.language !== resolvedLanguage) {
          await i18n.changeLanguage(resolvedLanguage);
        }

        const installation = data.installation;
        const nextAvailableModes =
          installation.availableProposalModes?.length > 0
            ? installation.availableProposalModes
            : [installation.defaultProposalMode];

            const calculation = data?.study?.calculation ?? null;

const nextAssignedKwp =
  typeof data?.study?.assigned_kwp === "number"
    ? data.study.assigned_kwp
    : null;

// Resolución del ahorro: prioriza el campo real annualSavingsInvestment
const nextEstimatedSavings =
  typeof calculation?.annualSavingsInvestment === "number"
    ? calculation.annualSavingsInvestment
    : typeof calculation?.annualSavingsService === "number"
      ? calculation.annualSavingsService
      : typeof calculation?.annualSavingsEuro === "number"
        ? calculation.annualSavingsEuro
        : typeof calculation?.estimatedAnnualSavingsEuro === "number"
          ? calculation.estimatedAnnualSavingsEuro
          : typeof calculation?.totalSavingsEuro === "number"
            ? calculation.totalSavingsEuro
            : null;

// Coste de inversión
const nextAmountToPayInvestment =
  typeof calculation?.investmentCost === "number"
    ? calculation.investmentCost
    : typeof calculation?.investmentTotal === "number"
      ? calculation.investmentTotal
      : null;

// Cuota mensual servicio: serviceCost es el coste ANUAL → dividir entre 12
const nextAmountToPayService =
  typeof calculation?.serviceCost === "number" && calculation.serviceCost > 0
    ? Math.round((calculation.serviceCost / 12) * 100) / 100
    : typeof calculation?.serviceMonthlyFee === "number"
      ? calculation.serviceMonthlyFee
      : typeof calculation?.monthlyFee === "number"
        ? calculation.monthlyFee
        : null;

// Potencia recomendada
const nextRecommendedPowerKwp =
  typeof calculation?.recommendedPowerKwp === "number"
    ? calculation.recommendedPowerKwp
    : typeof data?.study?.assigned_kwp === "number"
      ? data.study.assigned_kwp
      : null;

// Precio €/kWh que paga el cliente (con impuestos)
const nextClientPriceKwh =
  typeof calculation?.invoicePriceWithVatKwh === "number"
    ? calculation.invoicePriceWithVatKwh
    : typeof calculation?.weightedEnergyPriceKwh === "number"
      ? calculation.weightedEnergyPriceKwh
      : null;

        setInstallationPreview(installation);
        setAvailableModes(nextAvailableModes);
        setSelectedMode(
          nextAvailableModes.includes(installation.defaultProposalMode)
            ? installation.defaultProposalMode
            : nextAvailableModes[0] ?? "investment",
            
        );
        setAssignedKwp(nextAssignedKwp);
setEstimatedSavings(nextEstimatedSavings);
setAmountToPayInvestment(nextAmountToPayInvestment);
setAmountToPayService(nextAmountToPayService);
setRecommendedPowerKwp(nextRecommendedPowerKwp);
setClientPriceKwh(nextClientPriceKwh);
      } catch (error: any) {
        const message =
          error?.response?.data?.error ||
          error?.response?.data?.details ||
          t(
            "continueContract.toasts.couldNotLoadPreviewDescription",
            "No se pudo cargar la información de la instalación.",
          );

        setInstallationPreview(null);
        setAvailableModes([]);

        sileo.error({
          title: t(
            "continueContract.toasts.couldNotLoadPreviewTitle",
            "No se pudo cargar la propuesta",
          ),
          description: message,
        });
      } finally {
        setLoadingPreview(false);
      }
    };

    loadPreview();
  }, [token, langFromUrl, i18n, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      sileo.error({
        title: t(
          "continueContract.toasts.invalidLinkTitle",
          "Enlace no válido",
        ),
        description: t(
          "continueContract.toasts.invalidLinkDescription",
          "No se ha encontrado el token de acceso.",
        ),
      });
      return;
    }

    if (availableModes.length === 0) {
      sileo.error({
        title: t(
          "continueContract.toasts.invalidModeTitle",
          "Modalidad no disponible",
        ),
        description: t(
          "continueContract.toasts.invalidModeDescription",
          "La instalación seleccionada no permite continuar con ninguna modalidad disponible.",
        ),
      });
      return;
    }

    if (!availableModes.includes(selectedMode)) {
      sileo.error({
        title: t(
          "continueContract.toasts.invalidModeTitle",
          "Modalidad no disponible",
        ),
        description: t(
          "continueContract.toasts.invalidModeDescription",
          "La instalación seleccionada no permite continuar con esta modalidad.",
        ),
      });
      return;
    }

    if (!dni.trim() || !nombre.trim() || !apellidos.trim()) {
      sileo.error({
        title: t("continueContract.toasts.missingDataTitle", "Faltan datos"),
        description: t(
          "continueContract.toasts.missingDataDescription",
          "Debes completar DNI, nombre y apellidos.",
        ),
      });
      return;
    }

    setLoading(true);

    try {
      const { data } = await axios.post(
        "/api/contracts/proposal-access/validate",
        {
          token,
          dni: dni.trim().toUpperCase(),
          nombre: nombre.trim(),
          apellidos: apellidos.trim(),
        },
      );

      if (!data?.success || !data?.resumeToken) {
        throw new Error("No se pudo validar el acceso");
      }

      const backendAllowedModes: ProposalMode[] =
        data?.installation?.availableProposalModes ?? [];

      if (
        backendAllowedModes.length > 0 &&
        !backendAllowedModes.includes(selectedMode)
      ) {
        throw new Error(
          t(
            "continueContract.toasts.invalidModeDescription",
            "La instalación seleccionada no permite continuar con esta modalidad.",
          ),
        );
      }

      const resolvedLanguage = normalizeAppLanguage(
        data?.study?.language || data?.language || langFromUrl,
      );

      if (i18n.language !== resolvedLanguage) {
        await i18n.changeLanguage(resolvedLanguage);
      }

      sessionStorage.setItem("proposal_resume_token", data.resumeToken);
      sessionStorage.setItem("proposal_language", resolvedLanguage);

      sileo.success({
        title: t(
          "continueContract.toasts.accessValidatedTitle",
          "Acceso validado",
        ),
        description: t(
          "continueContract.toasts.accessValidatedDescription",
          "Vamos a continuar con tu contratación.",
        ),
      });

      navigate(
        `/contratacion-desde-propuesta?resume=${encodeURIComponent(
          data.resumeToken,
        )}&mode=${encodeURIComponent(selectedMode)}&lang=${encodeURIComponent(
          resolvedLanguage,
        )}`,
      );
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.details ||
        error?.message ||
        t(
          "continueContract.toasts.couldNotValidateDescription",
          "No se pudo validar tu acceso.",
        );

      sileo.error({
        title: t(
          "continueContract.toasts.couldNotContinueTitle",
          "No se pudo continuar",
        ),
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const modeCards = [
    {
      id: "investment" as ProposalMode,
      title: t("result.modes.investment", "Inversión"),
      subtitle: t(
        "continueContract.modes.investment.subtitle",
        "Mayor rentabilidad a largo plazo",
      ),
      icon: Wallet,
      description: t(
        "continueContract.modes.investment.description",
        "Ideal si quieres maximizar el ahorro y asumir la inversión inicial.",
      ),
    },
    {
      id: "service" as ProposalMode,
      title: t("result.modes.service", "Servicio"),
      subtitle: t(
        "continueContract.modes.service.subtitle",
        "Menor barrera de entrada",
      ),
      icon: Zap,
      description: t(
        "continueContract.modes.service.description",
        "Ideal si prefieres una cuota mensual y evitar el desembolso inicial.",
      ),
    },
  ];

  const visibleModeCards = modeCards.filter((mode) =>
    availableModes.includes(mode.id),
  );

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),linear-gradient(to_bottom,rgba(7,0,95,0.02),rgba(7,0,95,0.01))]" />

      <div className="relative z-10 px-4 py-4 md:py-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
            <div className="rounded-[2.5rem] border border-brand-navy/5 bg-brand-navy text-white p-7 md:p-8 shadow-2xl shadow-brand-navy/15 overflow-hidden relative xl:sticky xl:top-6">
              <div className="absolute top-0 right-0 w-48 h-48 bg-brand-mint/20 blur-3xl rounded-full -mr-16 -mt-16" />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#F8FAFC]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">
                  <Sparkles className="h-4 w-4" />
                  {t("continueContract.badge", "Continuar contratación")}
                </div>

                <h1 className="mt-5 text-3xl md:text-4xl font-black leading-tight">
                  {t("continueContract.hero.titleLine1", "Retoma tu propuesta")}
                  <br />
                  {t("continueContract.hero.titleLine2", "cuando quieras")}
                </h1>

                <p className="mt-4 text-sm leading-6 text-white/75">
                  {t(
                    "continueContract.hero.description",
                    "Accede con tus datos para continuar la contratación desde la propuesta que te enviamos por correo y selecciona la modalidad con la que deseas seguir.",
                  )}
                </p>

                <div className="mt-8 space-y-4">
                  <div className="rounded-[1.5rem] bg-[#F8FAFC]/10 border border-white/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#F8FAFC]/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">
                          {t(
                            "continueContract.cards.secureAccess.title",
                            "Acceso seguro",
                          )}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-white/70">
                          {t(
                            "continueContract.cards.secureAccess.description",
                            "Validamos tus datos antes de continuar con la contratación.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] bg-[#F8FAFC]/10 border border-white/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#F8FAFC]/10 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">
                          {t(
                            "continueContract.cards.modeChoice.title",
                            "Modalidad a elegir",
                          )}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-white/70">
                          {t(
                            "continueContract.cards.modeChoice.description",
                            "Podrás continuar por inversión o por servicio y generar el contrato según la opción elegida.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] bg-[#F8FAFC]/10 border border-white/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#F8FAFC]/10 flex items-center justify-center shrink-0">
                        <ArrowRight className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">
                          {t(
                            "continueContract.cards.fastProcess.title",
                            "Proceso rápido",
                          )}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-white/70">
                          {t(
                            "continueContract.cards.fastProcess.description",
                            "Tras validar el acceso irás directamente al flujo de contratación.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 rounded-[1.4rem] bg-[#F8FAFC]/10 border border-white/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                    {t("continueContract.linkStatus.label", "Estado del enlace")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {token
                      ? t(
                          "continueContract.linkStatus.valid",
                          "Token detectado correctamente",
                        )
                      : t(
                          "continueContract.linkStatus.missing",
                          "Falta token",
                        )}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-brand-navy/5 bg-[#F8FAFC] p-6 md:p-8 shadow-2xl shadow-brand-navy/5">
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-mint/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-navy">
                  <Sparkles className="h-4 w-4 text-brand-mint" />
                  {t("continueContract.accessBadge", "Acceso a propuesta")}
                </div>

                <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tight text-brand-navy">
                  {t("continueContract.form.title", "Confirma tus datos")}
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-gray">
                  {t(
                    "continueContract.form.description",
                    "Introduce los datos del titular y selecciona la modalidad con la que deseas continuar la contratación.",
                  )}
                </p>
              </div>

              {loadingPreview ? (
                <div className="mb-8 rounded-[2rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-6">
                  <div className="flex items-center gap-3 text-brand-navy">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <p className="text-sm font-semibold">
                      {t(
                        "continueContract.loadingPreview",
                        "Cargando información de la instalación...",
                      )}
                    </p>
                  </div>
                </div>
              ) : installationPreview ? (
                <div className="mb-8 rounded-[2rem] border border-brand-navy/5 bg-[linear-gradient(135deg,rgba(87,217,211,0.10),rgba(148,194,255,0.10))] p-5 md:p-6">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-navy/50">
                      {t(
                        "continueContract.installation.label",
                        "Instalación seleccionada",
                      )}
                    </p>

                    <h3 className="mt-2 text-xl md:text-2xl font-black text-brand-navy">
                      {installationPreview.nombre_instalacion ||
                        t(
                          "continueContract.installation.fallbackName",
                          "Instalación asignada",
                        )}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-brand-gray">
                      {installationPreview.direccion ||
                        t(
                          "continueContract.installation.noAddress",
                          "Dirección no disponible",
                        )}
                    </p>
                  </div>

                 <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
  {/* Ahorro anual */}
  {typeof estimatedSavings === "number" && (
    <div className="rounded-2xl bg-brand-mint/20 border border-brand-mint/40 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/55">
        {t("continueContract.installation.annualSavings", "Ahorro anual")}
      </p>
      <p className="mt-2 text-xl font-black text-brand-navy">
        {formatCurrency(estimatedSavings, normalizeAppLanguage(i18n.language))}
        <span className="ml-1 text-sm font-semibold text-brand-gray">/año</span>
      </p>
    </div>
  )}

  {/* Potencia recomendada */}
  {typeof recommendedPowerKwp === "number" && (
    <div className="rounded-2xl bg-[#F8FAFC]/70 border border-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
        {t("continueContract.installation.recommendedPower", "Potencia recomendada")}
      </p>
      <p className="mt-2 text-xl font-black text-brand-navy">
        {recommendedPowerKwp} kWp
      </p>
    </div>
  )}

  {/* Inversión total (inversión) o cuota mensual (servicio) */}
  {availableModes.includes("investment") && typeof amountToPayInvestment === "number" && (
    <div className="rounded-2xl bg-[#F8FAFC]/70 border border-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
        {t("continueContract.installation.investmentAmount", "Inversión")}
      </p>
      <p className="mt-2 text-xl font-black text-brand-navy">
        {formatCurrency(amountToPayInvestment, normalizeAppLanguage(i18n.language))}
      </p>
    </div>
  )}
  {!availableModes.includes("investment") && availableModes.includes("service") && typeof amountToPayService === "number" && (
    <div className="rounded-2xl bg-[#F8FAFC]/70 border border-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
        {t("continueContract.installation.serviceAmount", "Cuota mensual")}
      </p>
      <p className="mt-2 text-xl font-black text-brand-navy">
        {formatCurrency(amountToPayService, normalizeAppLanguage(i18n.language))}
        <span className="ml-1 text-sm font-semibold text-brand-gray">/mes</span>
      </p>
    </div>
  )}
</div>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-7">
                <div className="space-y-3">
                  <p className="text-sm font-bold text-brand-navy">
                    {t(
                      "continueContract.form.modeLabel",
                      "Modalidad a contratar",
                    )}
                  </p>

                  {!loadingPreview && availableModes.length === 0 && (
                    <div className="rounded-[1.4rem] border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-700">
                        {t(
                          "continueContract.modeUnavailable.title",
                          "No hay modalidades disponibles",
                        )}
                      </p>
                      <p className="mt-1 text-sm text-red-600">
                        {t(
                          "continueContract.modeUnavailable.description",
                          "No hemos podido determinar una modalidad válida para esta instalación.",
                        )}
                      </p>
                    </div>
                  )}

                  {!loadingPreview && availableModes.length === 1 && (
                    <div className="rounded-[1.4rem] border border-brand-mint/30 bg-brand-mint/10 p-4">
                      <p className="text-sm font-semibold text-brand-navy">
                        {t(
                          "continueContract.onlyOneMode.title",
                          "Modalidad disponible para esta instalación",
                        )}
                      </p>
                      <p className="mt-1 text-sm text-brand-gray">
                        {availableModes[0] === "investment"
                          ? t(
                              "continueContract.onlyOneMode.investment",
                              "Esta instalación solo permite contratación en modalidad inversión.",
                            )
                          : t(
                              "continueContract.onlyOneMode.service",
                              "Esta instalación solo permite contratación en modalidad servicio.",
                            )}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleModeCards.map((mode) => {
                      const Icon = mode.icon;
                      const isActive = selectedMode === mode.id;

                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setSelectedMode(mode.id)}
                          className={`rounded-[1.7rem] border p-5 text-left transition-all ${
                            isActive
                              ? "border-brand-mint bg-[linear-gradient(135deg,rgba(87,217,211,0.18),rgba(148,194,255,0.18))] shadow-lg shadow-brand-mint/10"
                              : "border-brand-navy/5 bg-[#F8FAFC] hover:border-brand-mint/40 hover:shadow-md"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                  isActive
                                    ? "bg-brand-navy text-white"
                                    : "bg-brand-navy/5 text-brand-navy"
                                }`}
                              >
                                <Icon className="h-6 w-6" />
                              </div>

                              <div>
                                <p className="text-lg font-bold text-brand-navy">
                                  {mode.title}
                                </p>
                                <p className="text-xs font-semibold text-brand-gray">
                                  {mode.subtitle}
                                </p>
                              </div>
                            </div>

                            <div
                              className={`mt-1 h-5 w-5 rounded-full border-2 ${
                                isActive
                                  ? "border-brand-navy bg-brand-navy"
                                  : "border-brand-navy/20"
                              }`}
                            >
                              {isActive ? (
                                <div className="flex h-full w-full items-center justify-center text-white text-[10px]">
                                  ✓
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <p className="mt-4 text-sm leading-6 text-brand-gray">
                            {mode.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-1">
                    <label className="mb-2 block text-sm font-semibold text-brand-navy">
                      {t("fields.dni", "DNI / NIF")}
                    </label>
                    <div className="relative">
                      <IdCard className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-navy/30" />
                      <input
                        type="text"
                        value={dni}
                        onChange={(e) => setDni(e.target.value.toUpperCase())}
                        placeholder={t("placeholders.dni", "12345678A")}
                        className="w-full rounded-2xl border border-brand-navy/10 bg-[#F8FAFC] px-12 py-4 text-brand-navy outline-none transition placeholder:text-brand-navy/35 focus:border-brand-mint focus:ring-4 focus:ring-brand-mint/10"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-1">
                    <label className="mb-2 block text-sm font-semibold text-brand-navy">
                      {t("fields.name", "Nombre")}
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-navy/30" />
                      <input
                        type="text"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder={t(
                          "continueContract.form.namePlaceholder",
                          "Tu nombre",
                        )}
                        className="w-full rounded-2xl border border-brand-navy/10 bg-[#F8FAFC] px-12 py-4 text-brand-navy outline-none transition placeholder:text-brand-navy/35 focus:border-brand-mint focus:ring-4 focus:ring-brand-mint/10"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-1">
                    <label className="mb-2 block text-sm font-semibold text-brand-navy">
                      {t("fields.lastName", "Apellidos")}
                    </label>
                    <div className="relative">
                      <Users className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-navy/30" />
                      <input
                        type="text"
                        value={apellidos}
                        onChange={(e) => setApellidos(e.target.value)}
                        placeholder={t(
                          "continueContract.form.lastNamePlaceholder",
                          "Tus apellidos",
                        )}
                        className="w-full rounded-2xl border border-brand-navy/10 bg-[#F8FAFC] px-12 py-4 text-brand-navy outline-none transition placeholder:text-brand-navy/35 focus:border-brand-mint focus:ring-4 focus:ring-brand-mint/10"
                      />
                    </div>
                  </div>
                </div>

                {availableModes.length > 0 && (
                  <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-brand-mint/15 flex items-center justify-center text-brand-navy shrink-0">
                        {selectedMode === "investment" ? (
                          <Wallet className="h-5 w-5" />
                        ) : (
                          <Zap className="h-5 w-5" />
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-bold text-brand-navy">
                          {t(
                            "continueContract.selectedMode.title",
                            "Modalidad seleccionada:",
                          )}{" "}
                          {formatModeLabel(selectedMode, t)}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-brand-gray">
                          {t(
                            "continueContract.selectedMode.description",
                            "Continuarás el flujo con esta modalidad para generar el contrato correspondiente.",
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || loadingPreview || availableModes.length === 0}
                  className="group mt-2 inline-flex w-full items-center justify-center rounded-[1.4rem] brand-gradient px-5 py-4 text-base font-bold text-brand-navy shadow-lg shadow-brand-mint/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading || loadingPreview ? (
                    <>
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                      {loadingPreview
                        ? t(
                            "continueContract.actions.checkingInstallation",
                            "Comprobando instalación...",
                          )
                        : t(
                            "continueContract.actions.validating",
                            "Validando acceso...",
                          )}
                    </>
                  ) : (
                    <>
                      {t(
                        "continueContract.actions.continue",
                        "Continuar contratación",
                      )}
                      <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}