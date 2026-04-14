import { ClientInstallationsMap } from "@/src/components/shared/ClientInstallationsMap";
import ExtraConsumptionModal, {
  ExtraConsumptionSelections,
  EMPTY_EXTRA_CONSUMPTION,
  calculateExtraMonthlyConsumption,
} from "@/src/components/shared/ExtraConsumptionModal";
import FileUploader from "@/src/components/shared/FileUploader";
import { PlacesAutocompleteInput } from "@/src/components/shared/PlacesAutocompleteInput";
import Button from "@/src/components/ui/Button";
import Input from "@/src/components/ui/Input";
import { formatCurrency, formatNumber, cn } from "@/src/lib/utils";
import { BillData } from "@/src/lib/validators";
import { confirmStudy } from "@/src/services/confirmStudyService";
import { extractBillFromApi } from "@/src/services/extractionApiService";
import { ExtractedBillData } from "@/src/services/geminiService";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import jsPDF from "jspdf";
import {
  ArrowRight,
  Building2,
  Check,
  FileText,
  Icon,
  Layout,
  Loader2,
  MapPin,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useRef, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { useTranslation, Trans } from "react-i18next";
import { sileo } from "sileo";
import {
  CalculationResult,
  calculateEnergyStudy,
} from "../../calculation/energyService";
// import { AppLanguage } from "../../pdf/pdfService";
import {
  getAvailableProposalModes,
  getDefaultProposalMode,
  getInstallationModeLabel,
  normalizeInstallationModalidad,
} from "./utils/proposalModes";
import {
  INSTALLATION_SEARCH_RADIUS_METERS,
  INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,
  chartPalette,
} from "../constants/proposal.constants";

import {
  formatPaybackYears,
  getDateLocale,
  getFirstNumericField,
  isBillType,
  normalizeAndRoundUp,
  normalizeAppLanguage,
  parseFormNumber,
  parseNumericValue,
  roundUpToDecimals,
  buildLastName,
  getPositiveFiniteNumber,
} from "./utils/proposalNumbers";
import type {
  AppLanguage,
  ApiInstallation,
  BankTransferPaymentResponse,
  ContractPreviewData,
  GeneratedContractResponse,
  ProposalCardData,
  ProposalMode,
  SignedContractResponse,
  Step,
  StripePaymentResponse,
  StudyComparisonResult,
  ValidationBillData,
} from "../components/types/proposal.types";
import LanguageSwitcher from "./layout/LanguageSwitcher";
import ProposalStepper from "./layout/ProposalStepper";
import UploadStep from "./steps/UploadStep";
import { FormSection } from "./types/SormSection";
import ValidationStep from "./steps/ValidationStep";
import MapStep from "./steps/MapStep";
import CalculationStep from "./steps/CalculationStep";
import { ResultStep } from "./steps/result/ResultStep";
import { buildProposalCardData, normalizeFeatureList } from "./utils/proposalCard";
import ContractSigningModal from "@/src/components/proposal/modals/ContractSigningModal";
import PaymentMethodModal from "@/src/components/proposal/modals/PaymentMethodModal";
import { useContractFlow } from "../../../components/proposal/hooks/useContractFlow";
import { useProposalResultState } from "@/src/components/proposal/hooks/useProposalResultState";


export default function MainAppContent() {
  const { t, i18n } = useTranslation();
  const currentAppLanguage = normalizeAppLanguage(
    i18n.resolvedLanguage || i18n.language,
  );

  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [extractedData, setExtractedData] =
    useState<Partial<ValidationBillData> | null>(null);
  const [rawExtraction, setRawExtraction] = useState<ExtractedBillData | null>(
    null,
  );
  const [installationAvailabilityError, setInstallationAvailabilityError] =
    useState<"no_installations_in_radius" | "insufficient_capacity" | null>(
      null,
    );
  const [proposalResults, setProposalResults] =
    useState<StudyComparisonResult | null>(null);

  const [privacyAccepted, setPrivacyAccepted] = useState(false);

const [selectedProposalView, setSelectedProposalView] =
  useState<ProposalMode>("investment");



  const [selectedInstallation, setSelectedInstallation] =
    useState<ApiInstallation | null>(null);






  const [clientCoordinates, setClientCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const clientCoords = clientCoordinates;








 
  const getModeVisualName = (mode: ProposalMode) =>
    mode === "investment" ? "Inversión" : "Servicio";

 

 
//   const topActiveMetrics = [
//     {
//       label: t("result.summary.investment"),
//       value:
//         activeProposal.id === "investment"
//           ? formatCurrency(activeProposal.upfrontCost)
//           : t("result.summary.noInitialInvestment"),
//       icon: "solar:calculator-bold-duotone",
//     },
//     {
//       label:
//         activeProposal.id === "investment"
//           ? t("result.summary.return")
//           : t("result.summary.monthlyFee"),
//       value:
//         activeProposal.id === "investment"
//           ? activeProposal.paybackYears > 0
//             ? `${Math.round(activeProposal.paybackYears)} ${t("result.units.years")}`
//             : "-"
//           : activeProposal.monthlyFee && activeProposal.monthlyFee > 0
//             ? `${formatCurrency(activeProposal.monthlyFee)} / ${t("result.units.month")}`
//             : t("result.summary.noFee"),
//       icon:
//         activeProposal.id === "investment"
//           ? "solar:graph-up-bold-duotone"
//           : "solar:wallet-money-bold-duotone",
//     },
//     {
//       label: t("result.summary.recommendedPower"),
//       value: `${formatNumber(activeProposal.recommendedPowerKwp)} kWp`,
//       icon: "solar:bolt-bold-duotone",
//     },
//     {
//       label: t("result.summary.annualConsumption"),
//       value: `${Math.round(activeProposal.annualConsumptionKwh)} kWh`,
//       icon: "solar:chart-2-bold-duotone",
//     },
//   ];

  const activeProposalStats =
    activeProposal.id === "investment"
      ? [
          {
            label: "Ahorro anual",
            value: activeMetrics.annualSavings,
          },
          {
            label: "Ahorro 25 años",
            value: activeMetrics.totalSavings25Years,
          },
          {
            label: "Coste inicial",
            value: activeMetrics.upfrontCost,
          },
          // {
          //   label: "Rentabilidad",
          //   value: activeMetrics.payback,
          // },
        ]
      : [
          {
            label: "Ahorro anual",
            value: activeMetrics.annualSavings,
          },
          {
            label: "Cuota mensual",
            value: activeMetrics.monthlyFee,
          },
          {
            label: "Ahorro 25 años",
            value: activeMetrics.totalSavings25Years,
          },
        ];

  const proposalSlides = [investmentProposal, serviceProposal];


  const comparisonRows = [
    {
      label: "Ahorro anual",
      investment: investmentMetrics.annualSavings,
      service: serviceMetrics.annualSavings,
    },
    {
      label: "Ahorro a 25 años",
      investment: investmentMetrics.totalSavings25Years,
      service: serviceMetrics.totalSavings25Years,
    },
    {
      label: "Coste inicial",
      investment: investmentMetrics.upfrontCost,
      service: serviceMetrics.upfrontCost,
    },
    {
      label: "Cuota mensual",
      investment: investmentMetrics.monthlyFee,
      service: serviceMetrics.monthlyFee,
    },
    {
      label: "Payback",
      investment: investmentMetrics.payback,
      service: serviceMetrics.payback,
    },
  ];

  const economicChartData = buildEconomicChartData(
    investmentProposal,
    serviceProposal,
  );

  useEffect(() => {
    if (selectedProposalView !== activeProposalMode) {
      setSelectedProposalView(activeProposalMode);
    }
  }, [selectedProposalView, activeProposalMode]);

  const activeSlideIndex = activeProposalMode === "investment" ? 0 : 1;

  const goToProposal = (mode: "investment" | "service") => {
    setSelectedProposalView(mode);
  };

  const goNextProposal = () => {
    setSelectedProposalView(
      activeProposalMode === "investment" ? "service" : "investment",
    );
  };

  const goPrevProposal = () => {
    setSelectedProposalView(
      activeProposalMode === "service" ? "investment" : "service",
    );
  };
  const [installations, setInstallations] = useState<ApiInstallation[]>([]);

  const [isLoadingInstallations, setIsLoadingInstallations] = useState(false);
  const [uploadedInvoiceFile, setUploadedInvoiceFile] = useState<File | null>(
    null,
  );
  const [savedStudy, setSavedStudy] = useState<any | null>(null);
  const studyPersistLock = useRef(false);

  // Popup de incremento de consumo (climatización / coche eléctrico)
  const [showExtraConsumptionModal, setShowExtraConsumptionModal] =
    useState(false);
  const [extraConsumption, setExtraConsumption] =
    useState<ExtraConsumptionSelections>(EMPTY_EXTRA_CONSUMPTION);
  const pendingValidationData = useRef<ValidationBillData | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ValidationBillDataFormInput, unknown, ValidationBillData>({
    resolver: zodResolver(ValidationBillDataSchema),
    defaultValues: {
      billType: "2TD",
    },
  });


  const handleDownloadPDF = async () => {
    if (!activeCalculationResult || !extractedData || !selectedInstallation)
      return;

    sileo.promise(
      (async () => {
        const billData = toBaseBillData(extractedData, extraConsumption);

        const pdfSummaries = buildProposalPdfSummariesForInstallation(
          activeCalculationResult,
          selectedInstallation,
          t,
        );

        const pdfArtifact = await buildPdfArtifact(
          billData,
          activeCalculationResult,
          pdfSummaries,
          currentAppLanguage,
        );

        savePdfArtifactLocally(
          pdfArtifact,
          `Estudio_Solar_${billData.name || "cliente"}.pdf`,
        );
      })(),
      {
        loading: {
          title: t(
            "toasts.pdf.generatingTitle",
            "Generando tu estudio en PDF...",
          ),
        },
        success: {
          title: t(
            "toasts.pdf.generatedTitle",
            "PDF generado y descargado con éxito",
          ),
        },
        error: {
          title: t(
            "toasts.pdf.generateErrorTitle",
            "No se pudo generar el PDF",
          ),
        },
      },
    );
  };
  const persistStudyAutomatically = async (
    validatedData: ValidationBillData,
    result: CalculationResult,
    installation: ApiInstallation,
  ) => {
    if (!uploadedInvoiceFile) {
      throw new Error(
        "No se encuentra la factura original subida por el cliente",
      );
    }

    const billData = toBaseBillData(validatedData, extraConsumption);

    const initialProposalMode = getDefaultProposalMode(installation.modalidad);

    const proposalSummariesForPdf = buildProposalPdfSummariesForInstallation(
      result,
      installation,
      t,
    );

    const pdfArtifact = await buildPdfArtifact(
      billData,
      result,
      proposalSummariesForPdf,
      currentAppLanguage,
    );

    const proposalBlob = pdfArtifactToBlob(pdfArtifact);

    const proposalFile = new File(
      [proposalBlob],
      `Estudio_Solar_${validatedData.name || "cliente"}.pdf`,
      { type: "application/pdf" },
    );

    const extractedLocation = (rawExtraction?.location ?? {}) as Record<
      string,
      any
    >;

    const customerPayload = {
      nombre: validatedData.name,
      apellidos: validatedData.lastName,
      dni: validatedData.dni,
      cups: validatedData.cups,
      direccion_completa: validatedData.address,
      email: validatedData.email,
      telefono: validatedData.phone,
      phone: validatedData.phone,
      iban: validatedData.iban,
      codigo_postal:
        extractedLocation.codigo_postal ??
        extractedLocation.codigoPostal ??
        extractedLocation.postalCode ??
        null,
      poblacion:
        extractedLocation.poblacion ??
        extractedLocation.ciudad ??
        extractedLocation.localidad ??
        extractedLocation.city ??
        null,
      provincia: extractedLocation.provincia ?? extractedLocation.state ?? null,
      pais: extractedLocation.pais ?? extractedLocation.country ?? "España",
      tipo_factura: validatedData.billType,
      consumo_mensual_real_kwh: validatedData.currentInvoiceConsumptionKwh,
      consumo_medio_mensual_kwh: validatedData.averageMonthlyConsumptionKwh,
      precio_p1_eur_kwh: validatedData.periodPriceP1 ?? null,
      precio_p2_eur_kwh: validatedData.periodPriceP2 ?? null,
      precio_p3_eur_kwh: validatedData.periodPriceP3 ?? null,
      precio_p4_eur_kwh: validatedData.periodPriceP4 ?? null,
      precio_p5_eur_kwh: validatedData.periodPriceP5 ?? null,
      precio_p6_eur_kwh: validatedData.periodPriceP6 ?? null,
    };

    const extraMonthlyKwh = calculateExtraMonthlyConsumption(extraConsumption);
    const invoiceDataPayload = {
      ...(rawExtraction?.invoice_data ?? {}),
      type: validatedData.billType,
      currentInvoiceConsumptionKwh: validatedData.currentInvoiceConsumptionKwh,
      averageMonthlyConsumptionKwh: validatedData.averageMonthlyConsumptionKwh,
      consumptionKwh: validatedData.currentInvoiceConsumptionKwh,
      // Previsión de incremento de consumo (climatización / coche eléctrico)
      extraConsumption:
        extraConsumption.hvac || extraConsumption.ev
          ? {
              hvac: extraConsumption.hvac,
              ev: extraConsumption.ev,
              hvacSquareMeters: extraConsumption.hvacSquareMeters,
              evAnnualKm: extraConsumption.evAnnualKm,
              extraMonthlyKwh: Math.round(extraMonthlyKwh * 100) / 100,
            }
          : null,
      periods: {
        P1: validatedData.periodConsumptionP1 ?? null,
        P2: validatedData.periodConsumptionP2 ?? null,
        P3: validatedData.periodConsumptionP3 ?? null,
        P4: validatedData.periodConsumptionP4 ?? null,
        P5: validatedData.periodConsumptionP5 ?? null,
        P6: validatedData.periodConsumptionP6 ?? null,
      },
      periodPricesEurPerKwh: {
        P1: validatedData.periodPriceP1 ?? null,
        P2: validatedData.periodPriceP2 ?? null,
        P3: validatedData.periodPriceP3 ?? null,
        P4: validatedData.periodPriceP4 ?? null,
        P5: validatedData.periodPriceP5 ?? null,
        P6: validatedData.periodPriceP6 ?? null,
      },
    };

    const locationPayload = {
      ...extractedLocation,
      address: validatedData.address,
      direccion_completa: validatedData.address,
      codigo_postal:
        extractedLocation.codigo_postal ??
        extractedLocation.codigoPostal ??
        extractedLocation.postalCode ??
        null,
      poblacion:
        extractedLocation.poblacion ??
        extractedLocation.ciudad ??
        extractedLocation.localidad ??
        extractedLocation.city ??
        null,
      provincia: extractedLocation.provincia ?? extractedLocation.state ?? null,
      pais: extractedLocation.pais ?? extractedLocation.country ?? "España",
      lat: clientCoordinates?.lat ?? null,
      lng: clientCoordinates?.lng ?? null,
    };

    if (import.meta.env.DEV) {
      console.debug("[front] confirmStudy payloads:", {
        customer: customerPayload,
        location: locationPayload,
        invoice: invoiceDataPayload,
      });
    }

    const assignedKwpForStudy = resolveEffectiveAssignedKwpForInstallation(
      validatedData,
      installation,
      rawExtraction,
    );

    const response = await confirmStudy({
      invoiceFile: uploadedInvoiceFile,
      proposalFile,
      customer: customerPayload,
      location: locationPayload,
      invoiceData: invoiceDataPayload,
      calculation: result,
      selectedInstallationId: installation.id,
      selectedInstallationSnapshot: installation,
      assignedKwp: assignedKwpForStudy,
      language: currentAppLanguage,
      consentAccepted: privacyAccepted,
    });

    if (import.meta.env.DEV) {
      console.debug("[front] confirmStudy response:", response);
    }

    setSavedStudy(response);

    if (response?.email?.status === "sent") {
      sileo.success({
        title: "Propuesta enviada por email",
        description: `Se ha enviado correctamente a ${response.email.to ?? "el cliente"}.`,
      });
    } else if (response?.email?.status === "failed") {
      sileo.error({
        title: "La propuesta se guardó, pero el email falló",
        description:
          response?.email?.error ?? "No se pudo enviar el correo al cliente.",
      });
    }

    return response;
  };
  const handleSendEmail = async () => {
    if (!savedStudy) {
      sileo.info({
        title: "Primero genera la propuesta",
        description:
          "El envío por email se realiza automáticamente al guardar el estudio.",
      });
      return;
    }

    const emailInfo = savedStudy?.email;

    if (emailInfo?.status === "sent") {
      sileo.success({
        title: "Correo ya enviado",
        description: `La propuesta se envió correctamente a ${emailInfo.to ?? "el cliente"}.`,
      });
      return;
    }

    if (emailInfo?.status === "failed") {
      sileo.error({
        title: "El envío automático falló",
        description:
          emailInfo?.error ??
          "La propuesta se guardó, pero no se pudo enviar el correo.",
      });
      return;
    }

    sileo.info({
      title: "Procesando envío",
      description:
        "El correo se envía automáticamente al confirmar y guardar el estudio.",
    });
  };



const {
  generatedContract,
  signedContractResult,
  isPaymentMethodModalOpen,
  isSelectingPaymentMethod,
  isContractModalOpen,
  isGeneratingContract,
  isSigningContract,
  signatureCanvasRef,
  setIsContractModalOpen,
  setIsPaymentMethodModalOpen,
  clearSignature,
  startSignatureDraw,
  moveSignatureDraw,
  endSignatureDraw,
  handleGenerateContract,
  handleSubmitSignedContract,
  handleSelectStripePayment,
  handleSelectBankTransferPayment,
} = useContractFlow({
  savedStudy,
  activeProposal,
  currentAppLanguage,
  t,
});
const {
  activeProposalMode,
  activeCalculationResult,
  activeProposal,
  activeModeLabelLower,
  contractPreviewModeLabel,
  contractAlreadySigned,
  hasMultipleProposalModes,
  reserveCardTitle,
  reserveCardDescription,
  reserveButtonText,
  visibleProposalPanels,
  topActiveMetrics,
  featuredResumeCard,
} = useProposalResultState({
  proposalResults,
  selectedInstallation,
  selectedProposalView,
  setSelectedProposalView,
  signedContractResult,
  generatedContract,
  t,
  buildProposalCardData,
});
 

  const handleFileSelect = async (file: File) => {
    if (!privacyAccepted) {
      sileo.warning({
        title: t(
          "toasts.upload.privacyRequiredTitle",
          "Debes aceptar la política de privacidad",
        ),
        description: t(
          "toasts.upload.privacyRequiredDescription",
          "Para subir la factura y continuar, debes aceptar el tratamiento de datos.",
        ),
      });
      return;
    }

    setUploadedInvoiceFile(file);

    sileo.promise(
      (async () => {
        const extraction = await extractBillFromApi(file);

        // Los logs de depuración con datos de la factura (PII del cliente)
        // solo se emiten en desarrollo. En producción no queremos DNI/IBAN/
        // dirección visibles en la consola del navegador del usuario.
        if (import.meta.env.DEV) {
          console.debug("[extraction] contracted power:", {
            text: extraction.invoice_data?.contractedPowerText,
            kw: extraction.invoice_data?.contractedPowerKw,
            p1: extraction.invoice_data?.contractedPowerP1,
            p2: extraction.invoice_data?.contractedPowerP2,
          });
        }

        const mappedData = mapExtractedToBillData(extraction);

        setRawExtraction(extraction);
        setExtractedData(mappedData);

        if (mappedData.name) setValue("name", mappedData.name);
        if (mappedData.lastName) setValue("lastName", mappedData.lastName);
        if (mappedData.dni) setValue("dni", mappedData.dni);
        if (mappedData.cups) setValue("cups", mappedData.cups);
        if (mappedData.address) setValue("address", mappedData.address);
        if (mappedData.email) setValue("email", mappedData.email);
        if (mappedData.phone) setValue("phone", mappedData.phone);
        if (mappedData.iban) setValue("iban", mappedData.iban);
        if (mappedData.contractedPowerText) {
          setValue("contractedPowerText", mappedData.contractedPowerText);
        }

        if (typeof mappedData.contractedPowerKw === "number") {
          setValue("contractedPowerKw", mappedData.contractedPowerKw);
        }

        if (typeof mappedData.contractedPowerP1 === "number") {
          setValue("contractedPowerP1", mappedData.contractedPowerP1);
        }

        if (typeof mappedData.contractedPowerP2 === "number") {
          setValue("contractedPowerP2", mappedData.contractedPowerP2);
        }

        if (mappedData.ibanMasked) {
          setValue("ibanMasked", mappedData.ibanMasked);
        }

        if (typeof mappedData.monthlyConsumption === "number") {
          setValue("monthlyConsumption", mappedData.monthlyConsumption);
        }

        if (mappedData.billType) {
          setValue("billType", mappedData.billType);
        }

        if (typeof mappedData.currentInvoiceConsumptionKwh === "number") {
          setValue(
            "currentInvoiceConsumptionKwh",
            mappedData.currentInvoiceConsumptionKwh,
          );
        }

        if (typeof mappedData.averageMonthlyConsumptionKwh === "number") {
          setValue(
            "averageMonthlyConsumptionKwh",
            mappedData.averageMonthlyConsumptionKwh,
          );
        }

        if (typeof mappedData.periodConsumptionP1 === "number") {
          setValue("periodConsumptionP1", mappedData.periodConsumptionP1);
        }
        if (typeof mappedData.periodConsumptionP2 === "number") {
          setValue("periodConsumptionP2", mappedData.periodConsumptionP2);
        }
        if (typeof mappedData.periodConsumptionP3 === "number") {
          setValue("periodConsumptionP3", mappedData.periodConsumptionP3);
        }
        if (typeof mappedData.periodConsumptionP4 === "number") {
          setValue("periodConsumptionP4", mappedData.periodConsumptionP4);
        }
        if (typeof mappedData.periodConsumptionP5 === "number") {
          setValue("periodConsumptionP5", mappedData.periodConsumptionP5);
        }
        if (typeof mappedData.periodConsumptionP6 === "number") {
          setValue("periodConsumptionP6", mappedData.periodConsumptionP6);
        }

        if (typeof mappedData.periodPriceP1 === "number") {
          setValue("periodPriceP1", mappedData.periodPriceP1);
        }
        if (typeof mappedData.periodPriceP2 === "number") {
          setValue("periodPriceP2", mappedData.periodPriceP2);
        }
        if (typeof mappedData.periodPriceP3 === "number") {
          setValue("periodPriceP3", mappedData.periodPriceP3);
        }
        if (typeof mappedData.periodPriceP4 === "number") {
          setValue("periodPriceP4", mappedData.periodPriceP4);
        }
        if (typeof mappedData.periodPriceP5 === "number") {
          setValue("periodPriceP5", mappedData.periodPriceP5);
        }
        if (typeof mappedData.periodPriceP6 === "number") {
          setValue("periodPriceP6", mappedData.periodPriceP6);
        }

        // NOTA: los campos de potencia contratada y el ibanMasked ya se
        // asignaron arriba; no hace falta repetir los setValue aquí.

        setCurrentStep("validation");
        showExtractionToasts(extraction, t);

        if (import.meta.env.DEV) {
          console.debug("[extraction] invoice_data:", extraction.invoice_data);
          console.debug("[extraction] customer:", extraction.customer);
          console.debug("[extraction] potencia mapeada:", {
            contractedPowerText: mappedData.contractedPowerText,
            contractedPowerKw: mappedData.contractedPowerKw,
            contractedPowerP1: mappedData.contractedPowerP1,
            contractedPowerP2: mappedData.contractedPowerP2,
          });
        }

        return extraction;
      })(),
      {
        loading: {
          title: t("toasts.upload.processingInvoice", "Procesando factura..."),
        },
        success: {
          title: t(
            "toasts.upload.invoiceProcessedSuccess",
            "Factura procesada con éxito",
          ),
        },
        error: {
          title: t(
            "toasts.upload.invoiceProcessedError",
            "No se pudo extraer la información de la factura",
          ),
        },
      },
    );
  };

  const onValidationSubmit = (data: ValidationBillData) => {
    // Normaliza los datos y abre el modal de incremento de consumo.
    // El geocoding y la transición al mapa se ejecutan DESPUÉS de que el
    // usuario responda (en proceedAfterExtraConsumption).
    const normalizedData: ValidationBillData = {
      ...(extractedData ?? {}),
      ...data,
      monthlyConsumption:
        data.averageMonthlyConsumptionKwh ??
        extractedData?.averageMonthlyConsumptionKwh ??
        data.monthlyConsumption ??
        extractedData?.monthlyConsumption ??
        0,
    };

    setExtractedData(normalizedData);
    setProposalResults(null);
    setSelectedProposalView("investment");
    setSelectedInstallation(null);
    setInstallationAvailabilityError(null);
    setExtraConsumption(EMPTY_EXTRA_CONSUMPTION);

    pendingValidationData.current = normalizedData;
    setShowExtraConsumptionModal(true);
  };

  const proceedAfterExtraConsumption = (
    selections: ExtraConsumptionSelections,
  ) => {
    setExtraConsumption(selections);
    setShowExtraConsumptionModal(false);

    const normalizedData = pendingValidationData.current;
    if (!normalizedData) return;

    // Si el usuario indicó incrementos futuros, mayoramos el consumo mensual.
    const extraMonthly = calculateExtraMonthlyConsumption(selections);
    if (extraMonthly > 0) {
      const currentMonthly =
        normalizedData.averageMonthlyConsumptionKwh ??
        normalizedData.monthlyConsumption ??
        0;
      const augmented = Math.round((currentMonthly + extraMonthly) * 100) / 100;
      normalizedData.monthlyConsumption = augmented;
      normalizedData.averageMonthlyConsumptionKwh = augmented;
      setExtractedData({ ...normalizedData });
    }

    sileo.promise(
      (async () => {
        const preResolved =
          clientCoordinates &&
          Number.isFinite(clientCoordinates.lat) &&
          Number.isFinite(clientCoordinates.lng)
            ? clientCoordinates
            : null;

        const coords =
          preResolved ?? (await geocodeAddress(normalizedData.address));

        if (!coords) {
          setClientCoordinates(null);
          setInstallations([]);
          setCurrentStep("map");

          sileo.error({
            title: t(
              "toasts.map.geocodeErrorTitle",
              "No se pudo localizar la dirección",
            ),
            description: t(
              "toasts.map.geocodeErrorDescription",
              "No hemos podido obtener las coordenadas de la dirección indicada. Prueba a seleccionar una sugerencia del autocompletado.",
            ),
          });

          return;
        }

        setClientCoordinates(coords);
        setCurrentStep("map");
        await fetchInstallations(coords, normalizedData);

        sileo.success({
          title: t(
            "toasts.validation.validatedSuccess",
            "Datos validados correctamente",
          ),
        });
      })(),
      {
        loading: {
          title: t(
            "toasts.validation.validatingLocationLoading",
            "Validando dirección y buscando instalaciones...",
          ),
        },
        success: {
          title: t(
            "toasts.validation.validatedSuccess",
            "Datos validados correctamente",
          ),
        },
        error: {
          title: t(
            "toasts.validation.validationError",
            "No se pudo validar la ubicación del cliente",
          ),
        },
      },
    );
  };

  const fetchInstallations = async (
    coordsParam?: { lat: number; lng: number } | null,
    validatedDataParam?: ValidationBillData | null,
  ) => {
    const coords = coordsParam ?? clientCoordinates;
    const validatedData =
      validatedDataParam ?? (extractedData as ValidationBillData | null);

    if (!coords) {
      setInstallations([]);
      setInstallationAvailabilityError("no_installations_in_radius");
      sileo.error({
        title: t(
          "toasts.map.locationUnavailableTitle",
          "Ubicación no disponible",
        ),
        description: t(
          "toasts.map.locationUnavailableDescription",
          "No se ha podido obtener la latitud y longitud del cliente.",
        ),
      });
      return;
    }

    if (!validatedData) {
      setInstallations([]);
      sileo.error({
        title: t("toasts.map.insufficientDataTitle", "Datos insuficientes"),
        description: t(
          "toasts.map.insufficientDataDescription",
          "No se han encontrado los datos validados del cliente para calcular la potencia necesaria.",
        ),
      });
      return;
    }

    setIsLoadingInstallations(true);
    setInstallationAvailabilityError(null);

    try {
      const response = await axios.get<
        ApiInstallation[] | { data: ApiInstallation[] }
      >("/api/installations", {
        params: {
          lat: coords.lat,
          lng: coords.lng,
          radius: INSTALLATION_SEARCH_RADIUS_METERS,
        },
      });

      const responseData = response.data;
      const parsedInstallations = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.data)
          ? responseData.data
          : [];

      const installationsInRadius = parsedInstallations
        .filter((item) => item.active !== false)
        .map((item) => ({
          ...item,
          modalidad: normalizeInstallationModalidad(item.modalidad),
        }));

      if (installationsInRadius.length === 0) {
        setInstallations([]);
        setInstallationAvailabilityError("no_installations_in_radius");
        return;
      }

      const eligibleInstallations = installationsInRadius
        .map((item) => {
          const requiredKwp = resolveEffectiveAssignedKwpForInstallation(
            validatedData,
            item,
            rawExtraction,
          );

          return {
            ...item,
            required_kwp: requiredKwp,
          };
        })
        .filter((item) => {
          const availableKwp = Number(item.available_kwp ?? 0);
          const requiredKwp = Number(item.required_kwp ?? 0);

          return (
            Number.isFinite(requiredKwp) &&
            requiredKwp > 0 &&
            availableKwp >= requiredKwp
          );
        });

      if (eligibleInstallations.length === 0) {
        setInstallations([]);
        setInstallationAvailabilityError("insufficient_capacity");
        return;
      }

      setInstallations(eligibleInstallations);
    } catch (error) {
      console.error("Error fetching installations:", error);
      sileo.error({
        title: t(
          "toasts.map.loadInstallationsErrorTitle",
          "Error al cargar instalaciones",
        ),
        description: t(
          "toasts.map.loadInstallationsErrorDescription",
          "Inténtalo de nuevo más tarde",
        ),
      });
      setInstallations([]);
      setInstallationAvailabilityError(null);
    } finally {
      setIsLoadingInstallations(false);
    }
  };
  const handleInstallationSelect = (inst: ApiInstallation) => {
    const normalizedInst: ApiInstallation = {
      ...inst,
      modalidad: normalizeInstallationModalidad(inst.modalidad),
    };

    const availableKwp = Number(normalizedInst.available_kwp ?? 0);
    const requiredKwp = Number(normalizedInst.required_kwp ?? 0);

    if (requiredKwp > 0 && availableKwp < requiredKwp) {
      sileo.error({
        title: t(
          "toasts.map.insufficientCapacityTitle",
          "Capacidad insuficiente",
        ),
        description: t(
          "toasts.map.insufficientCapacityDescription",
          "Esta instalación no dispone de potencia suficiente para cubrir la recomendación del estudio.",
        ),
      });
      return;
    }

    setSelectedInstallation(normalizedInst);
    setSelectedProposalView(getDefaultProposalMode(normalizedInst.modalidad));
    setCurrentStep("calculation");
  };

  useEffect(() => {
    if (currentStep !== "calculation") return;
    if (!extractedData || !selectedInstallation) return;

    const timer = window.setTimeout(() => {
      const validatedData = extractedData as ValidationBillData;

      const periodConsumptions = {
        P1: validatedData.periodConsumptionP1,
        P2: validatedData.periodConsumptionP2,
        P3: validatedData.periodConsumptionP3,
        P4: validatedData.periodConsumptionP4,
        P5: validatedData.periodConsumptionP5,
        P6: validatedData.periodConsumptionP6,
      };

      const periodPrices = {
        P1: validatedData.periodPriceP1,
        P2: validatedData.periodPriceP2,
        P3: validatedData.periodPriceP3,
        P4: validatedData.periodPriceP4,
        P5: validatedData.periodPriceP5,
        P6: validatedData.periodPriceP6,
      };

      const invoiceVariableEnergyAmountEur =
        getInvoiceVariableEnergyAmountFromExtraction(rawExtraction);

      const fixedPower = getFixedInstallationPower(selectedInstallation);

      const result = calculateEnergyStudy({
        monthlyConsumptionKwh:
          validatedData.averageMonthlyConsumptionKwh ??
          validatedData.monthlyConsumption ??
          0,
        invoiceConsumptionKwh:
          validatedData.currentInvoiceConsumptionKwh ??
          validatedData.averageMonthlyConsumptionKwh ??
          validatedData.monthlyConsumption ??
          0,
        billType:
          (validatedData.billType as BillData["billType"] | undefined) || "2TD",
        effectiveHours: selectedInstallation.horas_efectivas,
        investmentCostKwh: selectedInstallation.coste_kwh_inversion,
        serviceCostKwh: selectedInstallation.coste_kwh_servicio,
        modality: normalizeInstallationModalidad(
          selectedInstallation.modalidad,
        ),
        selfConsumptionRatio: normalizeSelfConsumption(
          selectedInstallation.porcentaje_autoconsumo,
        ),
        periodPrices,
        periodConsumptions,
        invoiceVariableEnergyAmountEur,
        surplusCompensationPriceKwh:
          selectedInstallation.precio_excedentes_eur_kwh ?? 0,
        maintenanceAnnualPerKwp:
          selectedInstallation.coste_anual_mantenimiento_por_kwp ??
          INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,
        vatRate: 0.21,
        forcedPowerKwp: fixedPower ?? undefined,
      });

      setProposalResults({
        investment: result,
        service: result,
      });
      setSelectedProposalView(
        getDefaultProposalMode(selectedInstallation.modalidad),
      );
      setCurrentStep("result");
      sileo.success({ title: "Estudio generado con éxito" });

      void (async () => {
        if (studyPersistLock.current) return;
        studyPersistLock.current = true;

        try {
          await persistStudyAutomatically(
            validatedData,
            result,
            selectedInstallation,
          );

          sileo.success({
            title: t(
              "toasts.study.savedTitle",
              "Propuesta guardada automáticamente",
            ),
            description: t(
              "toasts.study.savedDescription",
              "Cliente, factura, propuesta y estudio registrados.",
            ),
          });
        } catch (error: any) {
          console.error("Error guardando estudio confirmado:", error);
          console.error("error.message:", error?.message);
          console.error("error.response?.data:", error?.response?.data);
          console.error("error.response?.status:", error?.response?.status);

          sileo.error({
            title: t(
              "toasts.study.saveErrorTitle",
              "El estudio se generó, pero no se pudo guardar",
            ),
            description:
              error?.response?.data?.details ||
              error?.message ||
              t(
                "toasts.study.saveErrorDescription",
                "Revisa la configuración del servidor.",
              ),
          });
        } finally {
          studyPersistLock.current = false;
        }
      })();
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [currentStep, extractedData, selectedInstallation, rawExtraction, t]);

  return (
    <Layout>
      {/* Selector idioma */}
      <LanguageSwitcher />

      <div className="max-w-7xl mx-auto">
        <div
          className={cn(
            "mx-auto",
            currentStep === "result" ? "max-w-[1380px]" : "max-w-5xl",
          )}
        >
          {" "}
          <ProposalStepper currentStep={currentStep} t={t} />
          <AnimatePresence mode="wait">
            {currentStep === "upload" && (
              <UploadStep
                privacyAccepted={privacyAccepted}
                setPrivacyAccepted={setPrivacyAccepted}
                onFileSelect={handleFileSelect}
                currentAppLanguage={currentAppLanguage}
                t={t}
              />
            )}

            {currentStep === "validation" && (
              <ValidationStep
                register={register}
                control={control}
                handleSubmit={handleSubmit}
                errors={errors}
                onSubmit={onValidationSubmit}
                onAddressSelected={(place) => {
                  setClientCoordinates({
                    lat: place.lat,
                    lng: place.lng,
                  });
                }}
                t={t}
              />
            )}

            {currentStep === "map" && (
              <MapStep
                clientCoords={clientCoords}
                extractedAddress={extractedData?.address}
                installations={installations}
                selectedInstallation={selectedInstallation}
                isLoadingInstallations={isLoadingInstallations}
                installationAvailabilityError={installationAvailabilityError}
                onSelectInstallation={handleInstallationSelect}
                t={t}
              />
            )}
            {currentStep === "calculation" && <CalculationStep t={t} />}

            {currentStep === "result" && (
              <ResultStep
                t={t}
                proposalResults={proposalResults}
                hasMultipleProposalModes={hasMultipleProposalModes}
                activeProposal={activeProposal}
                activeProposalMode={activeProposalMode}
                setSelectedProposalView={setSelectedProposalView}
                topActiveMetrics={topActiveMetrics}
                featuredResumeCard={featuredResumeCard}
                visibleProposalPanels={visibleProposalPanels}
                savedStudy={savedStudy}
                isGeneratingContract={isGeneratingContract}
                isSigningContract={isSigningContract}
                contractAlreadySigned={contractAlreadySigned}
                reserveCardTitle={reserveCardTitle}
                reserveCardDescription={reserveCardDescription}
                activeModeLabelLower={activeModeLabelLower}
                reserveButtonText={reserveButtonText}
                signedContractResult={signedContractResult}
                handleGenerateContract={handleGenerateContract}
                handleDownloadPDF={handleDownloadPDF}
                formatCurrency={formatCurrency}
                formatNumber={formatNumber}
                normalizeFeatureList={normalizeFeatureList}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
       <ContractSigningModal
  open={isContractModalOpen}
  generatedContract={generatedContract}
  isSigningContract={isSigningContract}
  contractPreviewModeLabel={contractPreviewModeLabel}
  signatureCanvasRef={signatureCanvasRef}
  onClose={() => setIsContractModalOpen(false)}
  onClearSignature={clearSignature}
  onStartSignatureDraw={startSignatureDraw}
  onMoveSignatureDraw={moveSignatureDraw}
  onEndSignatureDraw={endSignatureDraw}
  onSubmitSignedContract={handleSubmitSignedContract}
  t={t}
/>
      </AnimatePresence>

      <AnimatePresence>
 <PaymentMethodModal
  open={isPaymentMethodModalOpen}
  signedContractResult={signedContractResult}
  isSelectingPaymentMethod={isSelectingPaymentMethod}
  currentAppLanguage={currentAppLanguage}
  onClose={() => setIsPaymentMethodModalOpen(false)}
  onSelectBankTransferPayment={handleSelectBankTransferPayment}
  onSelectStripePayment={handleSelectStripePayment}
  t={t}
/>
      </AnimatePresence>

      {/* Modal de incremento de consumo (climatización / coche eléctrico) */}
      <ExtraConsumptionModal
        open={showExtraConsumptionModal}
        onConfirm={proceedAfterExtraConsumption}
        onSkip={() => proceedAfterExtraConsumption(EMPTY_EXTRA_CONSUMPTION)}
        t={t}
      />
    </Layout>
  );
}
