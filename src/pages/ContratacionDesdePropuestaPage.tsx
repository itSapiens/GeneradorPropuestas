import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Icon } from "@iconify/react";
import { jsPDF } from "jspdf";
import { sileo } from "sileo";

type ContractPreviewData = {
  contractId: string;
  contractNumber: string;
  proposalMode: "investment" | "service";
  assignedKwp: number;
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
  };
};

type GeneratedContractResponse = {
  success: boolean;
  contract: {
    id: string;
    status: string;
    proposal_mode: "investment" | "service";
    contract_number: string;
  };
  previewHtml: string;
  preview: ContractPreviewData;
};

type SignedContractResponse = {
  success: boolean;
  message: string;
  contract: any;
  reservation: any;
  reservationSummary: {
    installationName: string;
    reservedKwp: number;
    paymentDeadlineAt: string;
    deadlineEnforced: boolean;
  };
  drive: {
    contractsRootFolderUrl: string;
    contractFolderUrl: string;
    contractFileUrl: string;
  };
  email?: {
    to: string | null;
    status: "pending" | "sent" | "failed";
    error: string | null;
  };
};

export default function ContratacionDesdePropuestaPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const resumeToken =
    searchParams.get("resume") ||
    sessionStorage.getItem("proposal_resume_token") ||
    "";

  const [generatedContract, setGeneratedContract] =
    useState<GeneratedContractResponse | null>(null);
  const [signedContractResult, setSignedContractResult] =
    useState<SignedContractResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSigningContract, setIsSigningContract] = useState(false);
  const [signatureHasContent, setSignatureHasContent] = useState(false);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const hasLoadedContractRef = useRef(false);

useEffect(() => {
  if (hasLoadedContractRef.current) return;
  hasLoadedContractRef.current = true;

  const loadContract = async () => {
    if (!resumeToken) {
      sileo.error({
        title: "Acceso no válido",
        description: "No se ha encontrado el token de continuación.",
      });
      navigate("/");
      return;
    }

    try {
      const { data } = await axios.post<GeneratedContractResponse>(
        "/api/contracts/generate-from-access",
        {
          resumeToken,
        },
      );

      setGeneratedContract(data);
    } catch (error: any) {
      console.error("Error cargando contrato desde acceso:", error);
      console.error("status:", error?.response?.status);
      console.error("data:", error?.response?.data);

      sileo.error({
        title: "No se pudo abrir el contrato",
        description:
          error?.response?.data?.details ||
          error?.response?.data?.error ||
          "Error desconocido",
      });

      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  void loadContract();
}, [resumeToken, navigate]);

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
    const pdf = new jsPDF({
      unit: "pt",
      format: "a4",
    });

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
    pdf.text("Contrato de adhesión", margin, y);
    y += 24;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(90, 90, 90);
    pdf.text(`Contrato nº ${preview.contractNumber}`, margin, y);
    y += 26;

    writeSectionTitle("Datos del cliente");
    writeParagraph(
      `Nombre: ${preview.client.nombre} ${preview.client.apellidos}`,
    );
    writeParagraph(`DNI: ${preview.client.dni}`);
    writeParagraph(`Email: ${preview.client.email || "-"}`);
    writeParagraph(`Teléfono: ${preview.client.telefono || "-"}`);

    writeSectionTitle("Datos de la instalación");
    writeParagraph(`Instalación: ${preview.installation.nombre_instalacion}`);
    writeParagraph(`Dirección: ${preview.installation.direccion}`);
    writeParagraph(
      `Modalidad: ${preview.proposalMode === "investment" ? "Inversión" : "Servicio"}`,
    );
    writeParagraph(`kWp asignados: ${preview.assignedKwp}`);

    writeSectionTitle("Condiciones básicas");
    writeParagraph(
      "El cliente solicita la reserva de la potencia indicada en la instalación seleccionada, quedando dicha reserva pendiente de confirmación económica.",
    );
    writeParagraph(
      "Se informa al cliente de un plazo orientativo de 15 días para realizar la transferencia correspondiente.",
    );
    writeParagraph(
      "Hasta la validación del pago, la reserva tendrá carácter provisional.",
    );

    y += 12;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(7, 0, 95);
    pdf.text("Firma del cliente", margin, y);
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

  const handleSubmitSignedContract = async () => {
    if (!generatedContract?.contract?.id || !generatedContract?.preview) {
      sileo.error({
        title: "Contrato no disponible",
        description: "No se ha podido preparar el contrato para firmar.",
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
      );

      const formData = new FormData();
      formData.append("signed_contract", signedPdfFile);

      const response = await axios.post<SignedContractResponse>(
        `/api/contracts/${generatedContract.contract.id}/sign`,
        formData,
      );

      setSignedContractResult(response.data);

      if (response.data.email?.status === "sent") {
        sileo.success({
          title: "Contrato enviado al cliente",
          description: `Se ha enviado una copia firmada a ${response.data.email.to ?? "su correo"}.`,
        });
      } else if (response.data.email?.status === "failed") {
        sileo.warning({
          title: "Contrato firmado, pero el email falló",
          description:
            response.data.email.error ??
            "No se pudo enviar la copia del contrato por correo.",
        });
      }

      sileo.success({
        title: "Contrato firmado correctamente",
        description: `Se han reservado ${response.data.reservationSummary.reservedKwp} kWp en ${response.data.reservationSummary.installationName}.`,
      });
    } catch (error: any) {
      sileo.error({
        title: "No se pudo firmar el contrato",
        description:
          error?.response?.data?.details ||
          error?.message ||
          "Ha ocurrido un error inesperado.",
      });
    } finally {
      setIsSigningContract(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-slate-700" />
          <p className="text-slate-600 font-semibold">
            Preparando tu contrato...
          </p>
        </div>
      </div>
    );
  }

  if (!generatedContract) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        {signedContractResult?.reservationSummary ? (
          <div className="mb-6 rounded-[1.5rem] bg-emerald-50 border border-emerald-200 p-5">
            <p className="text-sm font-bold uppercase tracking-widest text-emerald-700 mb-2">
              Contrato firmado
            </p>
            <p className="text-sm text-emerald-900 leading-relaxed">
              Se han reservado{" "}
              <strong>
                {signedContractResult.reservationSummary.reservedKwp} kWp
              </strong>{" "}
              en{" "}
              <strong>
                {signedContractResult.reservationSummary.installationName}
              </strong>
              .
            </p>
          </div>
        ) : null}

        <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white border border-slate-200 shadow-2xl overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="p-4 md:p-8 border-b lg:border-b-0 lg:border-r border-slate-200">
              <div className="rounded-[1.5rem] overflow-hidden border border-slate-200 bg-slate-50">
                <iframe
                  title="Vista previa del contrato"
                  srcDoc={generatedContract.previewHtml}
                  className="w-full h-[320px] sm:h-[420px] md:h-[560px] bg-white"
                />
              </div>
            </div>

            <div className="p-4 md:p-6 space-y-5 bg-slate-50">
              <div className="rounded-[1.4rem] bg-white border border-slate-200 p-4">
                <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-400 mb-2">
                  Contrato
                </p>
                <p className="font-bold text-slate-900">
                  {generatedContract.preview.contractNumber}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  {generatedContract.preview.client.nombre}{" "}
                  {generatedContract.preview.client.apellidos}
                </p>
                <p className="text-sm text-slate-500">
                  DNI: {generatedContract.preview.client.dni}
                </p>
              </div>

              <div className="rounded-[1.4rem] bg-white border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-400">
                    Firma
                  </p>

                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-sm font-semibold text-slate-700 hover:text-slate-900 transition"
                  >
                    Limpiar
                  </button>
                </div>

                <canvas
                  ref={signatureCanvasRef}
                  width={600}
                  height={180}
                  className="w-full h-40 rounded-[1.2rem] border border-dashed border-slate-300 bg-white touch-none"
                  onMouseDown={startSignatureDraw}
                  onMouseMove={moveSignatureDraw}
                  onMouseUp={endSignatureDraw}
                  onMouseLeave={endSignatureDraw}
                  onTouchStart={startSignatureDraw}
                  onTouchMove={moveSignatureDraw}
                  onTouchEnd={endSignatureDraw}
                />

                <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                  Firma dentro del recuadro. Al confirmar, se generará el PDF
                  firmado y se enviará al backend para crear la reserva.
                </p>
              </div>

              <div className="rounded-[1.4rem] bg-indigo-50 border border-indigo-100 p-4 text-slate-900">
                <div className="flex items-center gap-2 mb-2">
                  <Icon icon="solar:bolt-bold-duotone" className="h-5 w-5" />
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-slate-500">
                    Reserva provisional
                  </p>
                </div>

                <p className="text-sm leading-relaxed">
                  Al firmar, se reservarán{" "}
                  <span className="font-bold">
                    {generatedContract.preview.assignedKwp} kWp
                  </span>{" "}
                  en la instalación seleccionada.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleSubmitSignedContract}
                  disabled={isSigningContract}
                  className="w-full rounded-[1.2rem] bg-slate-900 px-4 py-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSigningContract ? "Firmando..." : "Firmar y reservar"}
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="w-full rounded-[1.2rem] border border-slate-300 bg-white px-4 py-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
