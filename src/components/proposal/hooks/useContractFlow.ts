import { useRef, useState } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import { sileo } from "sileo";
// import { AppLanguage } from "@/src/modules/pdf/pdfService";
import { getDateLocale } from "@/src/modules/proposal/components/utils/proposalNumbers";
import { TFunction } from "i18next";
import type {
  AppLanguage,
  BankTransferPaymentResponse,
  ContractPreviewData,
  GeneratedContractResponse,
  ProposalMode,
  SignedContractResponse,
  StripePaymentResponse,
} from "@/src/modules/proposal/components/types/proposal.types";

interface UseContractFlowParams {
  savedStudy: any;
  activeProposalMode: ProposalMode;
  currentAppLanguage: AppLanguage;
  t: TFunction;
}

export function useContractFlow({
  savedStudy,
  activeProposalMode,
  currentAppLanguage,
  t,
}: UseContractFlowParams) {
  const [generatedContract, setGeneratedContract] =
    useState<GeneratedContractResponse | null>(null);
  const [signedContractResult, setSignedContractResult] =
    useState<SignedContractResponse | null>(null);

  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] =
    useState(false);
  const [isSelectingPaymentMethod, setIsSelectingPaymentMethod] =
    useState(false);

  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isGeneratingContract, setIsGeneratingContract] = useState(false);
  const [isSigningContract, setIsSigningContract] = useState(false);
  const [signatureHasContent, setSignatureHasContent] = useState(false);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);

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
    language: AppLanguage,
  ) => {
    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
    });

    const locale = getDateLocale(language);

    const contractTexts = {
      title: t("contractPdf.title"),
      contractNumber: t("contractPdf.contractNumber"),
      date: t("contractPdf.date"),
      clientData: t("contractPdf.clientData"),
      name: t("contractPdf.name"),
      dni: t("contractPdf.dni"),
      email: t("contractPdf.email"),
      phone: t("contractPdf.phone"),
      installationData: t("contractPdf.installationData"),
      installation: t("contractPdf.installation"),
      mode: t("contractPdf.mode"),
      assignedKwp: t("contractPdf.assignedKwp"),
      basicConditions: t("contractPdf.basicConditions"),
      condition1: t("contractPdf.condition1"),
      condition2: t("contractPdf.condition2"),
      condition3: t("contractPdf.condition3"),
      transferInstructionsTitle: t(
        "contractPdf.transferInstructionsTitle",
        "Transferencia bancaria",
      ),
      transferInstructionsDescription: t(
        "contractPdf.transferInstructionsDescription",
        "Para confirmar la reserva, realiza la transferencia bancaria al IBAN de la instalación indicando exactamente el concepto señalado.",
      ),
      transferIban: t("contractPdf.transferIban", "IBAN"),
      transferConcept: t("contractPdf.transferConcept", "Concepto"),
      clientSignature: t("contractPdf.clientSignature"),
      investment: t("contractPdf.modes.investment"),
      service: t("contractPdf.modes.service"),
    };

    const margin = 48;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const usableWidth = pageWidth - margin * 2;
    let y = 56;

    const writeSectionTitle = (title: string) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(7, 0, 95);
      pdf.text(title, margin, y);
      y += 20;
    };

    const writeParagraph = (text: string) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(40, 40, 40);

      const lines = pdf.splitTextToSize(text, usableWidth);
      pdf.text(lines, margin, y);
      y += lines.length * 14 + 8;
    };

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(7, 0, 95);
    pdf.text(contractTexts.title, margin, y);
    y += 24;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(90, 90, 90);
    pdf.text(
      `${contractTexts.contractNumber} ${preview.contractNumber}`,
      margin,
      y,
    );
    y += 26;

    writeSectionTitle(contractTexts.clientData);
    writeParagraph(
      `${contractTexts.name}: ${preview.client.nombre} ${preview.client.apellidos}`,
    );
    writeParagraph(`${contractTexts.dni}: ${preview.client.dni}`);
    writeParagraph(`${contractTexts.email}: ${preview.client.email || "-"}`);
    writeParagraph(`${contractTexts.phone}: ${preview.client.telefono || "-"}`);

    writeSectionTitle(contractTexts.installationData);
    writeParagraph(
      `${contractTexts.installation}: ${preview.installation.nombre_instalacion}`,
    );
    writeParagraph(`${t("fields.address")}: ${preview.installation.direccion}`);
    writeParagraph(
      `${contractTexts.mode}: ${
        preview.proposalMode === "investment"
          ? contractTexts.investment
          : contractTexts.service
      }`,
    );
    writeParagraph(`${contractTexts.assignedKwp}: ${preview.assignedKwp}`);

    writeSectionTitle(contractTexts.basicConditions);
    writeParagraph(contractTexts.condition1);
    writeParagraph(contractTexts.condition2);
    writeParagraph(contractTexts.condition3);

    writeSectionTitle(contractTexts.transferInstructionsTitle);
    writeParagraph(contractTexts.transferInstructionsDescription);
    writeParagraph(
      `${contractTexts.transferIban}: ${preview.installation.iban_aportaciones || "-"}`,
    );
    writeParagraph(
      `${contractTexts.transferConcept}: DNI ${preview.client.dni} - ${preview.contractNumber}`,
    );

    y += 12;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(7, 0, 95);
    pdf.text(contractTexts.clientSignature, margin, y);
    y += 12;

    pdf.addImage(signatureDataUrl, "PNG", margin, y, 180, 70);

    const safeDni = preview.client.dni.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeName = `${preview.client.nombre}_${preview.client.apellidos}`
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    const blob = pdf.output("blob");

    return new File([blob], `CONTRATO_${safeDni}_${safeName}.pdf`, {
      type: "application/pdf",
    });
  };

  const handleGenerateContract = async () => {
    const studyId = savedStudy?.study?.id;

    if (!studyId) {
      sileo.error({
        title: "No hay estudio disponible",
        description:
          "Primero debe haberse guardado correctamente el estudio antes de iniciar la reserva.",
      });
      return;
    }

    setIsGeneratingContract(true);

    try {
      const response = await axios.post<GeneratedContractResponse>(
        `/api/contracts/generate-from-study/${studyId}`,
        {
          proposalMode: activeProposalMode,
          language: currentAppLanguage,
        },
      );

      setGeneratedContract(response.data);
      setIsContractModalOpen(true);

      window.setTimeout(() => {
        clearSignature();
      }, 80);
    } catch (error: any) {
      console.error("Error generando contrato:", error);

      sileo.error({
        title: "No se pudo generar el contrato",
        description:
          error?.response?.data?.details ||
          error?.message ||
          "Ha ocurrido un error inesperado.",
      });
    } finally {
      setIsGeneratingContract(false);
    }
  };

  const currentContractId =
    signedContractResult?.contract?.id ??
    generatedContract?.contract?.id ??
    null;

  const handleSubmitSignedContract = async () => {
    if (!generatedContract?.contract?.id || !generatedContract?.preview) {
      sileo.error({
        title: "Precontrato no disponible",
        description: "No se ha podido preparar el precontrato para firmar.",
      });
      return;
    }

    if (!signatureHasContent || !signatureCanvasRef.current) {
      sileo.warning({
        title: "Falta la firma",
        description: "Debes firmar en el recuadro antes de continuar.",
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
        currentAppLanguage,
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
      setIsContractModalOpen(false);
      setIsPaymentMethodModalOpen(true);

      sileo.success({
        title: t(
          "contractFlow.toasts.signedSuccessTitle",
          "Precontrato firmado correctamente",
        ),
        description: t(
          "contractFlow.toasts.signedSuccessDescription",
          "Se han reservado {{reservedKwp}} kWp en {{installationName}}. Ahora debes seleccionar la forma de pago para continuar.",
          {
            reservedKwp: response.data.reservation.reservedKwp,
            installationName: response.data.reservation.installationName,
          },
        ),
      });
    } catch (error: any) {
      console.error("Error firmando precontrato:", error);
      console.error("status:", error?.response?.status);
      console.error("data:", error?.response?.data);

      sileo.error({
        title: "No se pudo iniciar la reserva",
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          "Ha ocurrido un error inesperado.",
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
    } catch (error: any) {
      console.error("Error seleccionando transferencia bancaria:", error);

      sileo.error({
        title: "No se pudo preparar el pago por transferencia",
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          error?.message ||
          "Ha ocurrido un error inesperado.",
      });
    } finally {
      setIsSelectingPaymentMethod(false);
    }
  };

  return {
    generatedContract,
    signedContractResult,
    isPaymentMethodModalOpen,
    isSelectingPaymentMethod,
    isContractModalOpen,
    isGeneratingContract,
    isSigningContract,
    signatureHasContent,
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
  };
}
