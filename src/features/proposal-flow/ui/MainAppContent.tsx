import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { sileo } from "sileo";

import { formatCurrency, formatNumber } from "@/src/shared/lib/utils";
import type { ExtractedBillData } from "@/src/entities/proposal/domain/proposal.types";
import { useContractFlow } from "@/src/features/contract-flow/model/useContractFlow";
import { useProposalResultState } from "@/src/features/proposal-flow/model/useProposalResultState";
import type {
  ProposalMode,
  Step,
  StudyComparisonResult,
  ValidationBillData,
  ValidationBillDataFormInput,
} from "@/src/entities/proposal/domain/proposal.types";
import {
  getAvailableProposalModes,
  getDefaultProposalMode,
  normalizeInstallationModalidad,
  ValidationBillDataSchema,
} from "@/src/entities/proposal/domain/proposal.rules";
import { normalizeAppLanguage } from "@/src/features/proposal-flow/lib/proposalNumbers";
import {
  buildProposalCardData,
  normalizeFeatureList,
} from "@/src/features/proposal-flow/lib/proposalCard";
import ProposalWorkflow from "./ProposalWorkflow";
import { useInvoiceUpload } from "@/src/features/proposal-flow/model/useInvoiceUpload";
import { useInstallationFlow } from "@/src/features/proposal-flow/model/useInstallationFlow";
import { useExtraConsumptionFlow } from "@/src/features/extra-consumption/model/useExtraConsumptionFlow";
import { useStudyPersistence } from "@/src/features/proposal-flow/model/useStudyPersistence";
import { useProposalCalculationEffect } from "@/src/features/proposal-flow/model/useProposalCalculationEffect";
import {
  buildManualExtractionFromData,
  type ManualInvoiceData,
} from "@/src/features/proposal-flow/lib/manualInvoiceData";
import {
  mapExtractedToBillData,
} from "@/src/features/proposal-flow/lib/extractionMappers";
import { applyExtractedBillToValidationForm } from "@/src/features/proposal-flow/lib/validationFormValues";

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
  const [proposalResults, setProposalResults] =
    useState<StudyComparisonResult | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [selectedProposalView, setSelectedProposalView] =
    useState<ProposalMode>("investment");
  const [clientCoordinates, setClientCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [uploadedInvoiceFile, setUploadedInvoiceFile] = useState<File | null>(
    null,
  );
  const [savedStudy, setSavedStudy] = useState<any | null>(null);
  const [isManualInvoiceModalOpen, setIsManualInvoiceModalOpen] =
    useState(false);

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

  const {
    installations,
    selectedInstallation,
    isLoadingInstallations,
    installationAvailabilityError,
    clearInstallations,
    resetInstallationSelection,
    fetchInstallations,
    handleInstallationSelect,
  } = useInstallationFlow({
    clientCoordinates,
    extractedData,
    rawExtraction,
    setCurrentStep,
    setSelectedProposalView,
    t,
  });

  const {
    extraConsumption,
    showExtraConsumptionModal,
    onValidationSubmit,
    proceedAfterExtraConsumption,
  } = useExtraConsumptionFlow({
    extractedData,
    setExtractedData,
    setProposalResults,
    setSelectedProposalView,
    resetInstallationSelection,
    clientCoordinates,
    setClientCoordinates,
    clearInstallations,
    fetchInstallations,
    setCurrentStep,
    t,
  });

  const { handleFileSelect } = useInvoiceUpload({
    privacyAccepted,
    setUploadedInvoiceFile,
    setRawExtraction,
    setExtractedData,
    setCurrentStep,
    setValue,
    t,
  });

  const openManualInvoiceModal = () => {
    if (!privacyAccepted) {
      sileo.warning({
        title: t(
          "toasts.upload.privacyRequiredTitle",
          "Debes aceptar la política de privacidad",
        ),
        description: t(
          "toasts.upload.privacyRequiredDescription",
          "Para introducir los datos de la factura, primero debes aceptar el tratamiento de datos.",
        ),
      });
      return;
    }

    setIsManualInvoiceModalOpen(true);
  };

  const closeManualInvoiceModal = () => {
    setIsManualInvoiceModalOpen(false);
  };

  const handleManualInvoiceSubmit = (data: ManualInvoiceData) => {
    const extraction = buildManualExtractionFromData(data);
    const mappedData = mapExtractedToBillData(extraction);

    setUploadedInvoiceFile(null);
    setRawExtraction(extraction);
    setExtractedData(mappedData);
    applyExtractedBillToValidationForm(mappedData, setValue);
    setCurrentStep("validation");
    setIsManualInvoiceModalOpen(false);

    sileo.success({
      title: t(
        "manualInvoice.savedTitle",
        "Datos manuales cargados",
      ),
      description: t(
        "manualInvoice.savedDescription",
        "Revisa el titular y continúa con el estudio.",
      ),
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        openManualInvoiceModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const normalizedContractModalidad = normalizeInstallationModalidad(
    selectedInstallation?.modalidad,
  );
  const availableContractModes = getAvailableProposalModes(
    normalizedContractModalidad,
  );
  const activeProposalModeForContract = availableContractModes.includes(
    selectedProposalView,
  )
    ? selectedProposalView
    : getDefaultProposalMode(normalizedContractModalidad);

  const contractFlow = useContractFlow({
    savedStudy,
    activeProposalMode: activeProposalModeForContract,
    currentAppLanguage,
    t,
  });

  const resultState = useProposalResultState({
    proposalResults,
    selectedInstallation,
    selectedProposalView,
    setSelectedProposalView,
    signedContractResult: contractFlow.signedContractResult,
    generatedContract: contractFlow.generatedContract,
    t,
    buildProposalCardData,
  });

  const { handleDownloadPDF, persistStudyAutomatically } = useStudyPersistence({
    activeCalculationResult: resultState.activeCalculationResult,
    extractedData,
    selectedInstallation,
    uploadedInvoiceFile,
    extraConsumption,
    rawExtraction,
    clientCoordinates,
    privacyAccepted,
    currentAppLanguage,
    setSavedStudy,
    t,
  });

  useProposalCalculationEffect({
    currentStep,
    extractedData,
    selectedInstallation,
    rawExtraction,
    setProposalResults,
    setSelectedProposalView,
    setCurrentStep,
    persistStudyAutomatically,
    t,
  });

  useEffect(() => {
    if (selectedProposalView !== resultState.activeProposalMode) {
      setSelectedProposalView(resultState.activeProposalMode);
    }
  }, [selectedProposalView, resultState.activeProposalMode]);

  return (
    <ProposalWorkflow
      t={t}
      currentAppLanguage={currentAppLanguage}
      currentStep={currentStep}
      privacyAccepted={privacyAccepted}
      setPrivacyAccepted={setPrivacyAccepted}
      handleFileSelect={handleFileSelect}
      isManualInvoiceModalOpen={isManualInvoiceModalOpen}
      closeManualInvoiceModal={closeManualInvoiceModal}
      handleManualInvoiceSubmit={handleManualInvoiceSubmit}
      register={register}
      control={control}
      handleSubmit={handleSubmit}
      errors={errors}
      onValidationSubmit={onValidationSubmit}
      onAddressSelected={(place) => {
        setClientCoordinates({
          lat: place.lat,
          lng: place.lng,
        });
      }}
      clientCoords={clientCoordinates}
      extractedAddress={extractedData?.address}
      installations={installations}
      selectedInstallation={selectedInstallation}
      isLoadingInstallations={isLoadingInstallations}
      installationAvailabilityError={installationAvailabilityError}
      handleInstallationSelect={handleInstallationSelect}
      proposalResults={proposalResults}
      hasMultipleProposalModes={resultState.hasMultipleProposalModes}
      activeProposal={resultState.activeProposal}
      activeProposalMode={resultState.activeProposalMode}
      setSelectedProposalView={setSelectedProposalView}
      topActiveMetrics={resultState.topActiveMetrics}
      featuredResumeCard={resultState.featuredResumeCard}
      visibleProposalPanels={resultState.visibleProposalPanels}
      savedStudy={savedStudy}
      isGeneratingContract={contractFlow.isGeneratingContract}
      isSigningContract={contractFlow.isSigningContract}
      contractAlreadySigned={resultState.contractAlreadySigned}
      reserveCardTitle={resultState.reserveCardTitle}
      reserveCardDescription={resultState.reserveCardDescription}
      activeModeLabelLower={resultState.activeModeLabelLower}
      reserveButtonText={resultState.reserveButtonText}
      signedContractResult={contractFlow.signedContractResult}
      handleGenerateContract={contractFlow.handleGenerateContract}
      handleDownloadPDF={handleDownloadPDF}
      formatCurrency={formatCurrency}
      formatNumber={formatNumber}
      normalizeFeatureList={normalizeFeatureList}
      isContractModalOpen={contractFlow.isContractModalOpen}
      generatedContract={contractFlow.generatedContract}
      contractPreviewModeLabel={resultState.contractPreviewModeLabel}
      signatureCanvasRef={contractFlow.signatureCanvasRef}
      setIsContractModalOpen={contractFlow.setIsContractModalOpen}
      clearSignature={contractFlow.clearSignature}
      startSignatureDraw={contractFlow.startSignatureDraw}
      moveSignatureDraw={contractFlow.moveSignatureDraw}
      endSignatureDraw={contractFlow.endSignatureDraw}
      handleSubmitSignedContract={contractFlow.handleSubmitSignedContract}
      isPaymentMethodModalOpen={contractFlow.isPaymentMethodModalOpen}
      isSelectingPaymentMethod={contractFlow.isSelectingPaymentMethod}
      setIsPaymentMethodModalOpen={contractFlow.setIsPaymentMethodModalOpen}
      handleSelectBankTransferPayment={
        contractFlow.handleSelectBankTransferPayment
      }
      handleSelectStripePayment={contractFlow.handleSelectStripePayment}
      showExtraConsumptionModal={showExtraConsumptionModal}
      proceedAfterExtraConsumption={proceedAfterExtraConsumption}
    />
  );
}
