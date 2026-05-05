import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  FileSignature,
  Loader2,
  PenLine,
  ShieldCheck,
  Wallet,
  Zap,
} from "lucide-react";
import { Icon } from "@iconify/react";
import { sileo } from "sileo";
import { ENABLE_PAYMENT_METHOD_SELECTOR } from "@/src/features/contract-flow/lib/paymentFlow.constants";

type ProposalMode = "investment" | "service";
type PaymentMethodId = "stripe" | "bank_transfer";
type AppLanguage = "es" | "ca" | "val" | "gl";

type ContractPreviewData = {
  contractId: string;
  contractNumber: string;
  proposalMode: ProposalMode;
  assignedKwp: number;
  commercial: {
    annualMaintenance: number;
    availableModes: ProposalMode[];
    investmentPrice: number | null;
    reservationAmount: number;
    reservationMode: "fija" | "segun_potencia";
    selectedMode: ProposalMode;
    selectedPrice: number | null;
    selectedPriceUnit: "one_time" | "monthly";
    serviceMonthlyFee: number | null;
  };
  client: {
    id: string;
    nombre: string;
    apellidos: string;
    dni: string;
    email?: string | null;
    telefono?: string | null;
  };
  installation: {
    id: string;
    nombre_instalacion: string;
    direccion: string;
    modalidad?: "inversion" | "servicio" | "ambas" | null;
    empresa?: {
      id?: string | null;
      nombre?: string | null;
      cif?: string | null;
    } | null;
    iban_aportaciones?: string | null;
    potencia_instalada_kwp?: number | null;
    almacenamiento_kwh?: number | null;
    horas_efectivas?: number | null;
    porcentaje_autoconsumo?: number | null;
  };
};
type GeneratedContractResponse = {
  success: boolean;
  contract: {
    id: string;
    status: string;
    proposal_mode: ProposalMode;
    contract_number: string;
  };
  previewHtml: string;
  preview: ContractPreviewData;
};

type AlreadySignedContractAccessResponse = {
  alreadySigned: true;
  contract: {
    confirmed_at?: string | null;
    contract_number?: string | null;
    id: string;
    proposal_mode?: ProposalMode | null;
    signed_at?: string | null;
    status?: string | null;
    uploaded_at?: string | null;
  };
  message: string;
  nextStep?: "sign_contract" | "select_payment_method" | "pending_bank_transfer" | "completed";
  emailDeliveryStatus?: "sent" | "pending_retry";
  bankTransfer?: {
    iban: string;
    beneficiary: string;
    concept: string;
    paymentDeadlineAt: string;
    emailSentTo: string | null;
    supportEmail: string;
  } | null;
  reservation?: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    installationName: string;
    reservedKwp: number;
  };
  reservationSummary?: {
    paymentDeadlineAt?: string | null;
    paymentStatus?: string | null;
    reservationStatus?: string | null;
  } | null;
  success: boolean;
};

type SignedContractResponse = {
  success: boolean;
  message: string;
  nextStep?: "sign_contract" | "select_payment_method" | "pending_bank_transfer" | "completed";
  emailDeliveryStatus?: "sent" | "pending_retry";
  contract: {
    id: string;
    status: string;
  };
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    installationName: string;
    reservedKwp: number;
  };
  bankTransfer?: {
    iban: string;
    beneficiary: string;
    concept: string;
    paymentDeadlineAt: string;
    emailSentTo: string | null;
    supportEmail: string;
  } | null;
  payment?: {
    step: "select_method";
    availableMethods: {
      id: PaymentMethodId;
      label: string;
    }[];
  };
  drive: {
    contractsRootFolderUrl: string | null;
    contractFolderUrl: string | null;
    contractFileUrl: string | null;
  };
  storage?: {
    bucket: string;
    contractPath: string;
    folderPath: string;
  };
};

type StripePaymentResponse = {
  success: boolean;
  message: string;
  contract: {
    id: string;
    status: string;
    contractNumber: string;
  };
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    paymentMethod: "stripe";
  };
  stripe: {
    checkoutSessionId: string;
    checkoutUrl: string;
  };
};

type BankTransferPaymentResponse = {
  success: boolean;
  message: string;
  contract: {
    id: string;
    status: string;
    contractNumber: string;
  };
  reservation: {
    id: string;
    reservationStatus: string;
    paymentStatus: string;
    paymentDeadlineAt: string;
    signalAmount: number;
    currency: string;
    paymentMethod: "bank_transfer";
  };
  bankTransfer: {
    iban: string;
    beneficiary: string;
    concept: string;
    paymentDeadlineAt: string;
    emailSentTo: string;
    supportEmail: string;
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

function getLanguageLocale(language: AppLanguage): string {
  if (language === "ca" || language === "val") return "ca-ES";
  if (language === "gl") return "gl-ES";
  return "es-ES";
}

export default function ContratacionDesdePropuestaPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const rawLangFromUrl = useMemo(() => searchParams.get("lang"), [searchParams]);

  const activeLanguage = useMemo(
    () =>
      normalizeAppLanguage(
        rawLangFromUrl ||
          sessionStorage.getItem("proposal_language") ||
          i18n.resolvedLanguage ||
          i18n.language,
      ),
    [rawLangFromUrl, i18n.language, i18n.resolvedLanguage],
  );

  const locale = useMemo(
    () => getLanguageLocale(activeLanguage),
    [activeLanguage],
  );

  const formatCurrencyByLanguage = (
    value: number,
    currency = "EUR",
    decimals = 2,
  ) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number.isFinite(value) ? value : 0);

  const formatNumberByLanguage = (value: number, decimals = 2) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number.isFinite(value) ? value : 0);

  const resumeToken =
    searchParams.get("resume") ||
    sessionStorage.getItem("proposal_resume_token") ||
    "";

  const selectedModeFromUrl: ProposalMode =
    searchParams.get("mode") === "service" ? "service" : "investment";

  const [generatedContract, setGeneratedContract] =
    useState<GeneratedContractResponse | null>(null);
  const [alreadySignedContract, setAlreadySignedContract] =
    useState<AlreadySignedContractAccessResponse | null>(null);
  const [signedContractResult, setSignedContractResult] =
    useState<SignedContractResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSigningContract, setIsSigningContract] = useState(false);
  const [isSelectingPaymentMethod, setIsSelectingPaymentMethod] =
    useState(false);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] =
    useState(false);
  const [signatureHasContent, setSignatureHasContent] = useState(false);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);

  useEffect(() => {
    if (i18n.resolvedLanguage !== activeLanguage) {
      void i18n.changeLanguage(activeLanguage);
    }
  }, [activeLanguage, i18n]);

  const goHome = () => {
    sessionStorage.removeItem("proposal_resume_token");
    navigate("/");
  };

  useEffect(() => {
    const resumeFromUrl = searchParams.get("resume");
    const langFromUrl = searchParams.get("lang");

    if (resumeFromUrl) {
      sessionStorage.setItem("proposal_resume_token", resumeFromUrl);
    }

    if (langFromUrl) {
      sessionStorage.setItem(
        "proposal_language",
        normalizeAppLanguage(langFromUrl),
      );
    }
  }, [searchParams]);

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureHasContent(false);
  };

  const getCanvasPoint = (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ("touches" in event) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startSignatureDraw = (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    if ("touches" in event) {
      event.preventDefault();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasPoint(event, canvas);

    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#07005f";
    ctx.beginPath();
    ctx.moveTo(x, y);

    signatureDrawingRef.current = true;
    setSignatureHasContent(true);
  };

  const moveSignatureDraw = (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!signatureDrawingRef.current) return;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    if ("touches" in event) {
      event.preventDefault();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasPoint(event, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endSignatureDraw = () => {
    signatureDrawingRef.current = false;
  };

  const buildSignedContractPdfFile = async (
    preview: ContractPreviewData,
    signatureDataUrl: string,
  ) => {
    const safeDni = preview.client.dni.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeName = `${preview.client.nombre}_${preview.client.apellidos}`
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    const response = await axios.post<ArrayBuffer>(
      "/api/contracts/render-signed-pdf",
      {
        language: activeLanguage,
        preview,
        signatureDataUrl,
      },
      {
        responseType: "arraybuffer",
      },
    );

    const blob = new Blob([response.data], { type: "application/pdf" });

    return new File([blob], `CONTRATO_${safeDni}_${safeName}.pdf`, {
      type: "application/pdf",
    });
  };

  useEffect(() => {
    const loadContract = async () => {
      if (!resumeToken) {
        sileo.error({
          title: t(
            "contractFlow.toasts.invalidAccessTitle",
            "Acceso no válido",
          ),
          description: t(
            "contractFlow.toasts.invalidAccessDescription",
            "No se ha encontrado el token de continuación.",
          ),
        });
        navigate("/");
        return;
      }

      setLoading(true);
      setGeneratedContract(null);
      setAlreadySignedContract(null);
      setSignedContractResult(null);
      setIsPaymentMethodModalOpen(false);
      clearSignature();

      try {
        const { data } = await axios.post<
          GeneratedContractResponse | AlreadySignedContractAccessResponse
        >(
          "/api/contracts/generate-from-access",
          {
            resumeToken,
            proposalMode: selectedModeFromUrl,
          },
        );

        if ((data as AlreadySignedContractAccessResponse)?.alreadySigned) {
          if (
            (data as AlreadySignedContractAccessResponse).nextStep ===
              "pending_bank_transfer" &&
            (data as AlreadySignedContractAccessResponse).reservation
          ) {
            setSignedContractResult(
              data as unknown as SignedContractResponse,
            );
          } else {
            setAlreadySignedContract(data as AlreadySignedContractAccessResponse);
          }
          return;
        }

        setGeneratedContract(data as GeneratedContractResponse);
      } catch (error: any) {
        console.error("Error cargando contrato desde acceso:", error);
        console.error("status:", error?.response?.status);
        console.error("data:", error?.response?.data);

        if (error?.response?.data?.alreadySigned) {
          sileo.action({
            title: t(
              "contractFlow.toasts.alreadySignedTitle",
              "Precontrato ya firmado",
            ),
            description:
              error?.response?.data?.message ||
              t(
                "contractFlow.toasts.alreadySignedDescription",
                "Este precontrato ya fue firmado anteriormente.",
              ),
            actionLabel: t(
              "contractFlow.leftPanel.backHome",
              "Volver al inicio",
            ),
            onAction: goHome,
            duration: 3500,
            icon: (
              <Icon
                icon="solar:check-circle-bold-duotone"
                className="h-5 w-5 text-emerald-600"
              />
            ),
          } as any);

          window.setTimeout(() => {
            goHome();
          }, 2200);

          return;
        }

        sileo.error({
          title: t(
            "contractFlow.toasts.couldNotOpenTitle",
            "No se pudo abrir el contrato",
          ),
          description:
            error?.response?.data?.details ||
            error?.response?.data?.error ||
            t("contractFlow.toasts.unknownError", "Error desconocido"),
        });

        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    void loadContract();
  }, [resumeToken, selectedModeFromUrl, navigate, t]);

  const currentContractId =
    signedContractResult?.contract?.id ?? generatedContract?.contract?.id ?? null;

  const effectiveMode: ProposalMode =
    generatedContract?.preview?.proposalMode ?? selectedModeFromUrl;

  const modeLabel =
    effectiveMode === "investment"
      ? t("result.modes.investment", "Inversión")
      : t("result.modes.service", "Servicio");
  const commercial = generatedContract?.preview?.commercial ?? null;
  const availableModesLabel =
    commercial?.availableModes
      ?.map((mode) =>
        mode === "service"
          ? t("result.modes.service", "Servicio")
          : t("result.modes.investment", "Inversión"),
      )
      .join(" · ") ?? modeLabel;

  const handleSubmitSignedContract = async () => {
    if (!generatedContract?.contract?.id || !generatedContract?.preview) {
      sileo.error({
        title: t(
          "contractFlow.toasts.contractUnavailableTitle",
          "Contrato no disponible",
        ),
        description: t(
          "contractFlow.toasts.contractUnavailableDescription",
          "No se ha podido preparar el contrato para firmar.",
        ),
      });
      return;
    }

    if (!signatureHasContent || !signatureCanvasRef.current) {
      sileo.warning({
        title: t(
          "contractFlow.toasts.missingSignatureTitle",
          "Falta la firma",
        ),
        description: t(
          "contractFlow.toasts.missingSignatureDescription",
          "Debes firmar en el recuadro antes de continuar.",
        ),
      });
      return;
    }

    setIsSigningContract(true);

    try {
      const signatureDataUrl =
        signatureCanvasRef.current.toDataURL("image/png");

      const signedPdfFile = await buildSignedContractPdfFile(
        generatedContract.preview,
        signatureDataUrl,
      );

      const formData = new FormData();
      formData.append("signed_contract", signedPdfFile);

      const response = await axios.post<SignedContractResponse>(
        `/api/contracts/${generatedContract.contract.id}/sign`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setSignedContractResult(response.data);
      clearSignature();
      setIsPaymentMethodModalOpen(ENABLE_PAYMENT_METHOD_SELECTOR);

      if (response.data.nextStep === "pending_bank_transfer") {
        sileo.success({
          title: t(
            "contractFlow.toasts.signedSuccessTitle",
            "Contrato firmado correctamente",
          ),
          description:
            response.data.emailDeliveryStatus === "pending_retry"
              ? "La reserva ya está creada. Reintentaremos el envío de instrucciones de transferencia cuando vuelvas a entrar."
              : "Te hemos enviado las instrucciones de transferencia al correo. El pago queda pendiente de confirmación.",
        });
      } else {
        sileo.success({
          title: t(
            "contractFlow.toasts.signedSuccessTitle",
            "Precontrato firmado correctamente",
          ),
          description: t(
            "contractFlow.toasts.signedSuccessDescription",
            "Ahora debes seleccionar la forma de pago para continuar con la reserva.",
          ),
        });
      }
    } catch (error: any) {
      console.error("Error firmando contrato:", error);
      console.error("status:", error?.response?.status);
      console.error("data:", error?.response?.data);

      if (error?.response?.data?.alreadySigned) {
        sileo.action({
          title: t(
            "contractFlow.toasts.alreadySignedTitle",
            "Precontrato ya firmado",
          ),
          description:
            error?.response?.data?.message ||
            t(
              "contractFlow.toasts.alreadySignedDescription",
              "Este precontrato ya fue firmado anteriormente.",
            ),
          actionLabel: t(
            "contractFlow.leftPanel.backHome",
            "Volver al inicio",
          ),
          onAction: goHome,
          duration: 3500,
          icon: (
            <Icon
              icon="solar:check-circle-bold-duotone"
              className="h-5 w-5 text-emerald-600"
            />
          ),
        } as any);

        window.setTimeout(() => {
          goHome();
        }, 2200);

        return;
      }

      sileo.error({
        title: t(
          "contractFlow.toasts.couldNotSignTitle",
          "No se pudo firmar el contrato",
        ),
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          t(
            "contractFlow.toasts.unexpectedError",
            "Ha ocurrido un error inesperado.",
          ),
      });
    } finally {
      setIsSigningContract(false);
    }
  };

  const handleSelectStripePayment = async () => {
    if (!currentContractId) {
      sileo.error({
        title: t(
          "contractFlow.toasts.contractUnavailableTitle",
          "Contrato no disponible",
        ),
        description: t(
          "contractFlow.toasts.paymentContractUnavailableDescription",
          "No se ha encontrado el contrato para iniciar el pago.",
        ),
      });
      return;
    }

    setIsSelectingPaymentMethod(true);

    try {
      const response = await axios.post<StripePaymentResponse>(
        `/api/contracts/${currentContractId}/payments/stripe`,
      );

      const checkoutUrl = response.data?.stripe?.checkoutUrl;

      if (!checkoutUrl) {
        sileo.error({
          title: t(
            "contractFlow.toasts.paymentUnavailableTitle",
            "Pago no disponible",
          ),
          description: t(
            "contractFlow.toasts.paymentUnavailableDescription",
            "No se pudo obtener la URL de Stripe.",
          ),
        });
        return;
      }

      sileo.success({
        title: t(
          "contractFlow.toasts.redirectingStripeTitle",
          "Redirigiendo a Stripe",
        ),
        description: t(
          "contractFlow.toasts.redirectingStripeDescription",
          "Te llevamos al pago seguro con tarjeta.",
        ),
      });

      window.location.href = checkoutUrl;
    } catch (error: any) {
      console.error("Error iniciando pago con Stripe:", error);

      sileo.error({
        title: t(
          "contractFlow.toasts.couldNotStartStripeTitle",
          "No se pudo iniciar el pago con tarjeta",
        ),
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          t(
            "contractFlow.toasts.unexpectedError",
            "Ha ocurrido un error inesperado.",
          ),
      });
    } finally {
      setIsSelectingPaymentMethod(false);
    }
  };

  const handleSelectBankTransferPayment = async () => {
    if (!currentContractId) {
      sileo.error({
        title: t(
          "contractFlow.toasts.contractUnavailableTitle",
          "Contrato no disponible",
        ),
        description: t(
          "contractFlow.toasts.paymentContractUnavailableDescription",
          "No se ha encontrado el contrato para iniciar el pago.",
        ),
      });
      return;
    }

    setIsSelectingPaymentMethod(true);

    try {
      const response = await axios.post<BankTransferPaymentResponse>(
        `/api/contracts/${currentContractId}/payments/bank-transfer`,
      );

      setIsPaymentMethodModalOpen(false);

      sileo.success({
        title: t(
          "contractFlow.toasts.bankTransferSentTitle",
          "Instrucciones enviadas",
        ),
        description: t(
          "contractFlow.toasts.bankTransferSentDescription",
          "Hemos enviado el email con las instrucciones de transferencia a {{email}}.",
          { email: response.data.bankTransfer.emailSentTo },
        ),
      });

      sessionStorage.removeItem("proposal_resume_token");

      window.setTimeout(() => {
        navigate("/");
      }, 1200);
    } catch (error: any) {
      console.error("Error seleccionando transferencia bancaria:", error);

      sileo.error({
        title: t(
          "contractFlow.toasts.couldNotPrepareBankTitle",
          "No se pudo preparar el pago por transferencia",
        ),
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          t(
            "contractFlow.toasts.unexpectedError",
            "Ha ocurrido un error inesperado.",
          ),
      });
    } finally {
      setIsSelectingPaymentMethod(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.16),transparent_24%)]" />
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <div className="rounded-[2rem] border border-brand-navy/5 bg-[#F8FAFC] px-8 py-10 shadow-2xl shadow-brand-navy/5 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-brand-navy" />
            <p className="font-bold text-brand-navy">
              {t("contractFlow.loading.title", "Preparando tu contrato...")}
            </p>
            <p className="mt-2 text-sm text-brand-gray">
              {t(
                "contractFlow.loading.description",
                "Estamos cargando la modalidad seleccionada.",
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!generatedContract) {
    if (signedContractResult?.reservation) {
      return (
        <div className="min-h-screen bg-slate-50 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),linear-gradient(to_bottom,rgba(7,0,95,0.02),rgba(7,0,95,0.01))]" />
          <div className="relative z-10 min-h-screen px-4 py-8 md:px-8 md:py-10">
            <div className="mx-auto max-w-4xl rounded-[2.5rem] border border-brand-navy/5 bg-[#F8FAFC] p-8 shadow-2xl shadow-brand-navy/5">
              <div className="rounded-[1.8rem] border border-emerald-200 bg-emerald-50 p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                  {t("contractFlow.banner.title", "Contrato firmado")}
                </p>
                <h1 className="mt-3 text-3xl font-black text-brand-navy">
                  Contrato firmado correctamente
                </h1>
                <p className="mt-3 text-sm leading-6 text-brand-gray">
                  {signedContractResult.message ||
                    "Te hemos enviado por email las instrucciones para realizar la transferencia bancaria. El pago está pendiente de confirmación."}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    Instalación
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {signedContractResult.reservation.installationName}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    Estado
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {signedContractResult.emailDeliveryStatus === "pending_retry"
                      ? "Pendiente de reenvío de instrucciones"
                      : "Pago pendiente de confirmación"}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    Importe de reserva
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {formatCurrencyByLanguage(
                      signedContractResult.reservation.signalAmount,
                      signedContractResult.reservation.currency || "EUR",
                    )}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    Referencia
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {signedContractResult.bankTransfer?.concept || "-"}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    Email
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {signedContractResult.bankTransfer?.emailSentTo || "-"}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    Fecha límite
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {new Date(
                      signedContractResult.reservation.paymentDeadlineAt,
                    ).toLocaleDateString(locale)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={goHome}
                className="mt-8 inline-flex items-center gap-2 rounded-[1.2rem] brand-gradient px-5 py-4 text-sm font-bold text-brand-navy shadow-lg shadow-brand-mint/15"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("contractFlow.leftPanel.backHome", "Volver al inicio")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (alreadySignedContract) {
      const signedMode =
        alreadySignedContract.contract.proposal_mode === "service"
          ? t("result.modes.service", "Servicio")
          : t("result.modes.investment", "Inversión");

      return (
        <div className="min-h-screen bg-slate-50 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),linear-gradient(to_bottom,rgba(7,0,95,0.02),rgba(7,0,95,0.01))]" />
          <div className="relative z-10 min-h-screen px-4 py-8 md:px-8 md:py-10">
            <div className="mx-auto max-w-4xl rounded-[2.5rem] border border-brand-navy/5 bg-[#F8FAFC] p-8 shadow-2xl shadow-brand-navy/5">
              <div className="rounded-[1.8rem] border border-emerald-200 bg-emerald-50 p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                  {t("contractFlow.alreadySigned.badge", "Reserva ya creada")}
                </p>
                <h1 className="mt-3 text-3xl font-black text-brand-navy">
                  {t(
                    "contractFlow.alreadySigned.title",
                    "Este contrato ya fue firmado",
                  )}
                </h1>
                <p className="mt-3 text-sm leading-6 text-brand-gray">
                  {alreadySignedContract.message}
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    {t("contractFlow.alreadySigned.contractId", "Id de contrato")}
                  </p>
                  <p className="mt-2 text-sm font-bold break-all text-brand-navy">
                    {alreadySignedContract.contract.id}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    {t(
                      "contractFlow.alreadySigned.contractNumber",
                      "Número de contrato",
                    )}
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {alreadySignedContract.contract.contract_number || "-"}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    {t("contractFlow.alreadySigned.mode", "Modalidad")}
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {signedMode}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-brand-navy/5 bg-brand-navy/[0.02] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-navy/45">
                    {t(
                      "contractFlow.alreadySigned.reservationStatus",
                      "Estado de la reserva",
                    )}
                  </p>
                  <p className="mt-2 text-sm font-bold text-brand-navy">
                    {alreadySignedContract.reservationSummary?.reservationStatus || "-"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={goHome}
                className="mt-8 inline-flex items-center gap-2 rounded-[1.2rem] brand-gradient px-5 py-4 text-sm font-bold text-brand-navy shadow-lg shadow-brand-mint/15"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("contractFlow.leftPanel.backHome", "Volver al inicio")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),linear-gradient(to_bottom,rgba(7,0,95,0.02),rgba(7,0,95,0.01))]" />

      <div className="relative z-10 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {signedContractResult?.reservation ? (
            <div className="rounded-[1.6rem] bg-emerald-50 border border-emerald-200 p-5">
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-700 mb-2">
                {t("contractFlow.banner.title", "Contrato firmado")}
              </p>
              <p className="text-sm text-emerald-900 leading-relaxed">
                {t(
                  "contractFlow.banner.description",
                  "Se han reservado {{reservedKwp}} kWp en {{installationName}}.",
                  {
                    reservedKwp: signedContractResult.reservation.reservedKwp,
                    installationName:
                      signedContractResult.reservation.installationName,
                  },
                )}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
            <div className="rounded-[2.4rem] bg-brand-navy text-white p-6 md:p-7 shadow-2xl shadow-brand-navy/15 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-44 h-44 bg-brand-mint/20 blur-3xl rounded-full -mr-14 -mt-14" />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#F8FAFC]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">
                  <FileSignature className="h-4 w-4" />
                  {t(
                    "contractFlow.leftPanel.badge",
                    "Continuar contratación",
                  )}
                </div>

                <h1 className="mt-5 text-3xl md:text-4xl font-black leading-tight">
                  {t("contractFlow.leftPanel.titleLine1", "Revisa y firma")}
                  <br />
                  {t("contractFlow.leftPanel.titleLine2", "tu contrato")}
                </h1>

                <p className="mt-4 text-sm leading-6 text-white/75">
                  {t(
                    "contractFlow.leftPanel.description",
                    "Has accedido desde una propuesta enviada previamente. Revisa la modalidad seleccionada, comprueba el contrato y firma para continuar con la reserva.",
                  )}
                </p>

                <div className="mt-7 space-y-4">
                  <div className="rounded-[1.5rem] bg-[#F8FAFC]/10 border border-white/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                      {t("contractFlow.leftPanel.holder", "Titular")}
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {generatedContract.preview.client.nombre}{" "}
                      {generatedContract.preview.client.apellidos}
                    </p>
                    <p className="mt-1 text-sm text-white/70">
                      {t("contractFlow.contractCard.dni", "DNI")}:{" "}
                      {generatedContract.preview.client.dni}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] bg-[#F8FAFC]/10 border border-white/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                      {t("contractFlow.leftPanel.installation", "Instalación")}
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {generatedContract.preview.installation.nombre_instalacion}
                    </p>
                    <p className="mt-1 text-sm text-white/70 leading-6">
                      {generatedContract.preview.installation.direccion}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] bg-[#F8FAFC]/10 border border-white/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                      {t(
                        "contractFlow.leftPanel.assignedPower",
                        "Potencia asignada",
                      )}
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {formatNumberByLanguage(
                        generatedContract.preview.assignedKwp,
                      )}{" "}
                      kWp
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goHome}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/85 hover:text-white transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t(
                    "contractFlow.leftPanel.backHome",
                    "Volver al inicio",
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] md:rounded-[2.5rem] bg-[#F8FAFC] border border-brand-navy/5 shadow-2xl shadow-brand-navy/5 overflow-hidden">
              <div className="border-b border-brand-navy/5 px-5 py-5 md:px-8 md:py-6 bg-[#F8FAFC]/95 backdrop-blur-md">
                <div className="rounded-[1.3rem] bg-brand-mint/10 border border-brand-mint/20 p-4 flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-brand-navy text-white flex items-center justify-center shrink-0">
                    {effectiveMode === "investment" ? (
                      <Wallet className="h-5 w-5" />
                    ) : (
                      <Zap className="h-5 w-5" />
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-brand-navy">
                      {t(
                        "contractFlow.selectedMode.title",
                        "Modalidad seleccionada:",
                      )}{" "}
                      {modeLabel}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-brand-gray">
                      {t(
                        "contractFlow.selectedMode.description",
                        "Esta es la modalidad elegida previamente antes de firmar el contrato.",
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="p-4 md:p-8 border-b lg:border-b-0 lg:border-r border-brand-navy/5">
                  <div className="rounded-[1.5rem] overflow-hidden border border-brand-navy/5 bg-brand-sky/5">
                    <iframe
                      title={t(
                        "contractFlow.iframe.title",
                        "Vista previa del contrato",
                      )}
                      srcDoc={generatedContract.previewHtml}
                      className="w-full h-[420px] sm:h-[560px] md:h-[780px] bg-[#F8FAFC]"
                    />
                  </div>
                </div>

                <div className="p-4 md:p-6 space-y-5 bg-brand-navy/[0.02]">
                  <div className="rounded-[1.4rem] bg-[#F8FAFC] border border-brand-navy/5 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-2">
                      {t("contractFlow.contractCard.title", "Contrato")}
                    </p>
                    <p className="font-bold text-brand-navy">
                      {generatedContract.preview.contractNumber}
                    </p>
                    <p className="text-sm text-brand-gray mt-2">
                      {generatedContract.preview.client.nombre}{" "}
                      {generatedContract.preview.client.apellidos}
                    </p>
                    <p className="text-sm text-brand-gray">
                      {t("contractFlow.contractCard.dni", "DNI")}:{" "}
                      {generatedContract.preview.client.dni}
                    </p>
                  </div>

                  <div className="rounded-[1.4rem] bg-[#F8FAFC] border border-brand-navy/5 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-3">
                      Resumen económico
                    </p>

                    <div className="space-y-2 text-sm text-brand-navy/80">
                      <p>
                        <span className="font-bold text-brand-navy">
                          Modalidades disponibles:
                        </span>{" "}
                        {availableModesLabel}
                      </p>
                      <p>
                        <span className="font-bold text-brand-navy">
                          {commercial?.selectedMode === "service"
                            ? "Precio del servicio:"
                            : "Precio de la inversión:"}
                        </span>{" "}
                        {commercial?.selectedPrice != null
                          ? formatCurrencyByLanguage(commercial.selectedPrice)
                          : "-"}{" "}
                        {commercial?.selectedPriceUnit === "monthly"
                          ? "/ mes"
                          : commercial?.selectedPrice != null
                            ? "pago único"
                            : ""}
                      </p>
                      <p>
                        <span className="font-bold text-brand-navy">
                          Reserva:
                        </span>{" "}
                        {formatCurrencyByLanguage(
                          commercial?.reservationAmount ?? 0,
                        )}
                      </p>
                      <p>
                        <span className="font-bold text-brand-navy">
                          Mantenimiento anual:
                        </span>{" "}
                        {formatCurrencyByLanguage(
                          commercial?.annualMaintenance ?? 0,
                        )}
                      </p>
                      {commercial?.availableModes?.includes("investment") && commercial?.investmentPrice != null ? (
                        <p>
                          <span className="font-bold text-brand-navy">
                            Inversión:
                          </span>{" "}
                          {formatCurrencyByLanguage(commercial.investmentPrice)}
                        </p>
                      ) : null}
                      {commercial?.availableModes?.includes("service") && commercial?.serviceMonthlyFee != null ? (
                        <p>
                          <span className="font-bold text-brand-navy">
                            Servicio:
                          </span>{" "}
                          {formatCurrencyByLanguage(
                            commercial.serviceMonthlyFee,
                          )}{" "}
                          / mes
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] bg-[#F8FAFC] border border-brand-navy/5 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40">
                        {t("contractFlow.signature.title", "Firma")}
                      </p>

                      <button
                        type="button"
                        onClick={clearSignature}
                        className="text-sm font-semibold text-brand-navy hover:text-brand-mint transition"
                      >
                        {t("contractFlow.signature.clear", "Limpiar")}
                      </button>
                    </div>

                    <canvas
                      ref={signatureCanvasRef}
                      width={600}
                      height={180}
                      className="w-full h-40 rounded-[1.2rem] border border-dashed border-brand-navy/20 bg-[#F8FAFC] touch-none"
                      onMouseDown={startSignatureDraw}
                      onMouseMove={moveSignatureDraw}
                      onMouseUp={endSignatureDraw}
                      onMouseLeave={endSignatureDraw}
                      onTouchStart={startSignatureDraw}
                      onTouchMove={moveSignatureDraw}
                      onTouchEnd={endSignatureDraw}
                    />

                    <p className="text-xs text-brand-gray mt-3 leading-relaxed">
                      {t(
                        "contractFlow.signature.help",
                        "Firma dentro del recuadro. Al confirmar, se generará el PDF firmado, se creará la reserva provisional y se enviarán las instrucciones de transferencia bancaria.",
                      )}
                    </p>
                  </div>

                  <div className="rounded-[1.4rem] bg-brand-mint/10 border border-brand-mint/20 p-4 text-brand-navy">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="h-5 w-5" />
                      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/60">
                        {t(
                          "contractFlow.reservation.title",
                          "Reserva provisional",
                        )}
                      </p>
                    </div>

                    <p className="text-sm leading-relaxed">
                      {t(
                        "contractFlow.reservation.description",
                        "Al firmar, se reservarán {{assignedKwp}} kWp en la instalación seleccionada bajo modalidad de {{modeLabel}}.",
                        {
                          assignedKwp: formatNumberByLanguage(
                            generatedContract.preview.assignedKwp,
                          ),
                          modeLabel: modeLabel.toLowerCase(),
                        },
                      )}
                    </p>

                    <div className="mt-3 pt-3 border-t border-brand-mint/30 flex items-center justify-between">
                      <p className="text-sm font-bold text-brand-navy/70">
                        {t(
                          "contractFlow.reservation.signalLabel",
                          "Pago de reserva",
                        )}
                      </p>
                      <p className="text-lg font-bold text-brand-navy">
                        {formatCurrencyByLanguage(
                          commercial?.reservationAmount ?? 0,
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleSubmitSignedContract}
                      disabled={isSigningContract || !!signedContractResult}
                      className="w-full rounded-[1.2rem] brand-gradient px-4 py-4 text-sm font-bold text-brand-navy transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-brand-mint/15"
                    >
                      {isSigningContract ? (
                        <span className="inline-flex items-center justify-center">
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          {t("contractFlow.actions.signing", "Firmando...")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center">
                          <PenLine className="mr-3 h-5 w-5" />
                          {signedContractResult
                            ? t(
                                "contractFlow.actions.signed",
                                "Contrato firmado",
                              )
                            : t(
                                "contractFlow.actions.signAndContinue",
                                "Firmar y continuar",
                              )}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={goHome}
                      className="w-full rounded-[1.2rem] border border-brand-navy/10 bg-[#F8FAFC] px-4 py-4 text-sm font-bold text-brand-navy transition hover:bg-brand-navy/[0.02]"
                    >
                      {t("common.cancel", "Cancelar")}
                    </button>
                  </div>

                  {signatureHasContent ? (
                    <div className="rounded-[1.2rem] bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        {t(
                          "contractFlow.signature.detected",
                          "Firma detectada correctamente.",
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {ENABLE_PAYMENT_METHOD_SELECTOR &&
      isPaymentMethodModalOpen &&
      signedContractResult?.reservation ? (
        <div className="fixed inset-0 z-[210] bg-brand-navy/50 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full px-4 py-4 md:px-8 md:py-8 flex items-start md:items-center justify-center">
            <div className="w-full max-w-3xl rounded-[2rem] md:rounded-[2.5rem] bg-[#F8FAFC] border border-brand-navy/5 shadow-2xl overflow-hidden">
              <div className="p-5 md:p-8 border-b border-brand-navy/5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-1">
                    {t("contractFlow.modal.badge", "Contratación")}
                  </p>
                  <h3 className="text-xl md:text-2xl font-bold text-brand-navy">
                    {t(
                      "contractFlow.modal.title",
                      "Selecciona la forma de pago",
                    )}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPaymentMethodModalOpen(false)}
                  className="w-11 h-11 rounded-2xl bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition shrink-0"
                  disabled={isSelectingPaymentMethod}
                >
                  ✕
                </button>
              </div>

              <div className="p-5 md:p-8 space-y-6 bg-brand-navy/[0.02]">
                <div className="rounded-[1.4rem] bg-[#F8FAFC] border border-brand-navy/5 p-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-3">
                    {t(
                      "contractFlow.modal.reservationSummary",
                      "Resumen de la reserva",
                    )}
                  </p>

                  <div className="space-y-2 text-sm text-brand-navy/80">
                    <p>
                      <span className="font-bold text-brand-navy">
                        {t(
                          "contractFlow.modal.installation",
                          "Instalación",
                        )}
                        :
                      </span>{" "}
                      {signedContractResult.reservation.installationName}
                    </p>
                    <p>
                      <span className="font-bold text-brand-navy">
                        {t(
                          "contractFlow.modal.reservedPower",
                          "Potencia reservada",
                        )}
                        :
                      </span>{" "}
                      {signedContractResult.reservation.reservedKwp} kWp
                    </p>
                    <p>
                      <span className="font-bold text-brand-navy">
                        {t("contractFlow.modal.signal", "Señal")}:
                      </span>{" "}
                      {formatCurrencyByLanguage(
                        signedContractResult.reservation.signalAmount,
                        signedContractResult.reservation.currency || "EUR",
                      )}
                    </p>
                    <p>
                      <span className="font-bold text-brand-navy">
                        {t("contractFlow.modal.deadline", "Fecha límite")}:
                      </span>{" "}
                      {new Date(
                        signedContractResult.reservation.paymentDeadlineAt,
                      ).toLocaleDateString(locale)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                  <button
                    type="button"
                    onClick={handleSelectBankTransferPayment}
                    disabled={isSelectingPaymentMethod}
                    className="rounded-[1.5rem] border border-brand-navy/10 bg-[#F8FAFC] p-6 text-left shadow-sm hover:shadow-md transition disabled:opacity-60"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-brand-navy/5 flex items-center justify-center mb-4">
                      <Icon
                        icon="solar:card-transfer-bold-duotone"
                        className="h-6 w-6 text-brand-navy"
                      />
                    </div>

                    <p className="text-lg font-bold text-brand-navy">
                      {t(
                        "contractFlow.modal.bankTransferTitle",
                        "Transferencia bancaria",
                      )}
                    </p>
                    <p className="mt-2 text-sm text-brand-gray leading-relaxed">
                      {t(
                        "contractFlow.modal.bankTransferDescription",
                        "Recibirás un correo con el IBAN, el concepto y el PDF del precontrato firmado. Tendrás 15 días para realizar la transferencia.",
                      )}
                    </p>
                  </button>

                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    className="w-full rounded-[1.2rem] border border-brand-navy/10 bg-[#F8FAFC] px-4 py-4 text-sm font-bold text-brand-navy transition hover:bg-brand-navy/[0.02] disabled:opacity-60"
                    onClick={() => setIsPaymentMethodModalOpen(false)}
                    disabled={isSelectingPaymentMethod}
                  >
                    {isSelectingPaymentMethod ? (
                      <span className="inline-flex items-center justify-center">
                        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                        {t("common.processing", "Procesando...")}
                      </span>
                    ) : (
                      t("common.close", "Cerrar")
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
