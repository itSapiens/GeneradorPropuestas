import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";

import { formatCurrency, formatNumber } from "@/src/lib/utils";
import type { ExtractedBillData } from "@/src/services/geminiService";
import { useContractFlow } from "@/src/components/proposal/hooks/useContractFlow";
import { useProposalResultState } from "@/src/components/proposal/hooks/useProposalResultState";
import type {
  ProposalMode,
  Step,
  StudyComparisonResult,
  ValidationBillData,
  ValidationBillDataFormInput,
} from "./types/proposal.types";
import {
  getAvailableProposalModes,
  getDefaultProposalMode,
  normalizeInstallationModalidad,
  ValidationBillDataSchema,
} from "./utils/proposalModes";
import { normalizeAppLanguage } from "./utils/proposalNumbers";
import {
  buildProposalCardData,
  normalizeFeatureList,
} from "./utils/proposalCard";
import ProposalWorkflow from "./ProposalWorkflow";
import { useInvoiceUpload } from "./hooks/useInvoiceUpload";
import { useInstallationFlow } from "./hooks/useInstallationFlow";
import { useExtraConsumptionFlow } from "./hooks/useExtraConsumptionFlow";
import { useStudyPersistence } from "./hooks/useStudyPersistence";
import { useProposalCalculationEffect } from "./hooks/useProposalCalculationEffect";

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
