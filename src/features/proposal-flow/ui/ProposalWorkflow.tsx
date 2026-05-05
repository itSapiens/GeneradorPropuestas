import { AnimatePresence } from "motion/react";
import type { TFunction } from "i18next";
import type {
  Control,
  FieldErrors,
  UseFormHandleSubmit,
  UseFormRegister,
} from "react-hook-form";
import type {
  Dispatch,
  MouseEvent,
  RefObject,
  SetStateAction,
  TouchEvent,
} from "react";

import Layout from "@/src/shared/ui/layout/Layout";
import ExtraConsumptionModal, {
  EMPTY_EXTRA_CONSUMPTION,
  type ExtraConsumptionSelections,
} from "@/src/features/extra-consumption/ui/ExtraConsumptionModal";
import { cn } from "@/src/shared/lib/utils";
import ContractSigningModal from "@/src/features/contract-flow/ui/ContractSigningModal";
import PaymentMethodModal from "@/src/features/contract-flow/ui/PaymentMethodModal";
import LanguageSwitcher from "@/src/features/language-switcher/ui/LanguageSwitcher";
import ProposalStepper from "@/src/shared/ui/stepper/ProposalStepper";
import UploadStep from "@/src/features/proposal-flow/steps/upload/UploadStep";
import ValidationStep from "@/src/features/proposal-flow/steps/validation/ValidationStep";
import MapStep from "@/src/features/proposal-flow/steps/map/MapStep";
import CalculationStep from "@/src/features/proposal-flow/steps/calculation/CalculationStep";
import { ResultStep } from "@/src/features/proposal-flow/steps/result/ResultStep";
import type {
  FeaturedResumeCard,
  Proposal,
  TopActiveMetric,
} from "@/src/features/proposal-flow/steps/result/ResultStepInterfaces";
import type {
  ApiInstallation,
  AppLanguage,
  GeneratedContractResponse,
  ProposalMode,
  SignedContractResponse,
  Step,
  StudyComparisonResult,
  ValidationBillData,
  ValidationBillDataFormInput,
} from "@/src/entities/proposal/domain/proposal.types";
import type { InstallationAvailabilityError } from "@/src/features/proposal-flow/model/useInstallationFlow";
import { ENABLE_PAYMENT_METHOD_SELECTOR } from "@/src/features/contract-flow/lib/paymentFlow.constants";

interface ProposalWorkflowProps {
  t: TFunction;
  currentAppLanguage: AppLanguage;
  currentStep: Step;
  privacyAccepted: boolean;
  setPrivacyAccepted: Dispatch<SetStateAction<boolean>>;
  handleFileSelect: (file: File) => Promise<void>;
  register: UseFormRegister<ValidationBillDataFormInput>;
  control: Control<
    ValidationBillDataFormInput,
    unknown,
    ValidationBillData
  >;
  handleSubmit: UseFormHandleSubmit<
    ValidationBillDataFormInput,
    ValidationBillData
  >;
  errors: FieldErrors<ValidationBillDataFormInput>;
  onValidationSubmit: (data: ValidationBillData) => void;
  onAddressSelected: (place: {
    formattedAddress: string;
    lat: number;
    lng: number;
  }) => void;
  clientCoords: { lat: number; lng: number } | null;
  extractedAddress?: string;
  installations: ApiInstallation[];
  selectedInstallation: ApiInstallation | null;
  isLoadingInstallations: boolean;
  installationAvailabilityError: InstallationAvailabilityError;
  handleInstallationSelect: (inst: ApiInstallation) => void;
  proposalResults: StudyComparisonResult | null;
  hasMultipleProposalModes: boolean;
  activeProposal: Proposal;
  activeProposalMode: ProposalMode;
  setSelectedProposalView: Dispatch<SetStateAction<ProposalMode>>;
  topActiveMetrics: TopActiveMetric[];
  featuredResumeCard: FeaturedResumeCard;
  visibleProposalPanels: Proposal[];
  savedStudy: any;
  isGeneratingContract: boolean;
  isSigningContract: boolean;
  contractAlreadySigned: boolean;
  reserveCardTitle: string;
  reserveCardDescription: string;
  activeModeLabelLower: string;
  reserveButtonText: string;
  signedContractResult: SignedContractResponse | null;
  handleGenerateContract: () => void;
  handleDownloadPDF: () => void;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  normalizeFeatureList: (list: string[], targetLength: number) => (string | null)[];
  isContractModalOpen: boolean;
  generatedContract: GeneratedContractResponse | null;
  contractPreviewModeLabel: string;
  signatureCanvasRef: RefObject<HTMLCanvasElement | null>;
  setIsContractModalOpen: Dispatch<SetStateAction<boolean>>;
  clearSignature: () => void;
  startSignatureDraw: (
    event: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>,
  ) => void;
  moveSignatureDraw: (
    event: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>,
  ) => void;
  endSignatureDraw: () => void;
  handleSubmitSignedContract: () => void;
  isPaymentMethodModalOpen: boolean;
  isSelectingPaymentMethod: boolean;
  setIsPaymentMethodModalOpen: Dispatch<SetStateAction<boolean>>;
  handleSelectBankTransferPayment: () => void;
  handleSelectStripePayment: () => void;
  showExtraConsumptionModal: boolean;
  proceedAfterExtraConsumption: (
    selections: ExtraConsumptionSelections,
  ) => void;
}

export default function ProposalWorkflow({
  t,
  currentAppLanguage,
  currentStep,
  privacyAccepted,
  setPrivacyAccepted,
  handleFileSelect,
  register,
  control,
  handleSubmit,
  errors,
  onValidationSubmit,
  onAddressSelected,
  clientCoords,
  extractedAddress,
  installations,
  selectedInstallation,
  isLoadingInstallations,
  installationAvailabilityError,
  handleInstallationSelect,
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
  isContractModalOpen,
  generatedContract,
  contractPreviewModeLabel,
  signatureCanvasRef,
  setIsContractModalOpen,
  clearSignature,
  startSignatureDraw,
  moveSignatureDraw,
  endSignatureDraw,
  handleSubmitSignedContract,
  isPaymentMethodModalOpen,
  isSelectingPaymentMethod,
  setIsPaymentMethodModalOpen,
  handleSelectBankTransferPayment,
  handleSelectStripePayment,
  showExtraConsumptionModal,
  proceedAfterExtraConsumption,
}: ProposalWorkflowProps) {
  return (
    <Layout>
      <LanguageSwitcher />

      {currentStep === "upload" && (
        <div className="wrapper-titulo-ayto">
          <h1 className="titulo-trazo">
            {t("hero.titleLine1")} <br className="pc-only" />
            {t("hero.titleLine2")} <span className="palabra-trazo">{t("hero.titleHighlight")}</span>
          </h1>
          <div className="subtitulo-trazo">{t("hero.subtitle")}</div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div
          className={cn(
            "mx-auto",
            currentStep === "result" ? "max-w-[1380px]" : "max-w-5xl",
          )}
        >
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
                onAddressSelected={onAddressSelected}
                t={t}
              />
            )}

            {currentStep === "map" && (
              <MapStep
                clientCoords={clientCoords}
                extractedAddress={extractedAddress}
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
          signalAmount={
            selectedInstallation?.reserva_fija_eur != null &&
            selectedInstallation.reserva_fija_eur > 0
              ? selectedInstallation.reserva_fija_eur
              : 500
          }
          formatCurrency={formatCurrency}
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

      {ENABLE_PAYMENT_METHOD_SELECTOR ? (
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
      ) : null}

      <ExtraConsumptionModal
        open={showExtraConsumptionModal}
        onConfirm={proceedAfterExtraConsumption}
        onSkip={() => proceedAfterExtraConsumption(EMPTY_EXTRA_CONSUMPTION)}
        t={t}
      />
    </Layout>
  );
}
