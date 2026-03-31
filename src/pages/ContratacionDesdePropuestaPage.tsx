import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { jsPDF } from "jspdf";
import { sileo } from "sileo";
import { cn, formatNumber } from "../lib/utils";

type ProposalMode = "investment" | "service";

type ContractPreviewData = {
  contractId: string;
  contractNumber: string;
  proposalMode: ProposalMode;
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
    proposal_mode: ProposalMode;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const resumeToken =
    searchParams.get("resume") ||
    sessionStorage.getItem("proposal_resume_token") ||
    "";

  const modeFromUrl = searchParams.get("mode");
  const initialMode: ProposalMode =
    modeFromUrl === "service" ? "service" : "investment";

  const [selectedMode, setSelectedMode] =
    useState<ProposalMode>(initialMode);

  const [generatedContract, setGeneratedContract] =
    useState<GeneratedContractResponse | null>(null);
  const [signedContractResult, setSignedContractResult] =
    useState<SignedContractResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSigningContract, setIsSigningContract] = useState(false);
  const [signatureHasContent, setSignatureHasContent] = useState(false);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);

  useEffect(() => {
    const nextMode = searchParams.get("mode") === "service" ? "service" : "investment";
    setSelectedMode(nextMode);
  }, [searchParams]);

  useEffect(() => {
    const loadContract = async () => {
      if (!resumeToken) {
        sileo.error({
          title: "Acceso no válido",
          description: "No se ha encontrado el token de continuación.",
        });
        navigate("/");
        return;
      }

      setLoading(true);
      setGeneratedContract(null);
      setSignedContractResult(null);
      clearSignature();

      try {
        const { data } = await axios.post<GeneratedContractResponse>(
          "/api/contracts/generate-from-access",
          {
            resumeToken,
            proposalMode: selectedMode,
          },
        );

        setGeneratedContract(data);
      } catch (error: any) {
        console.error("Error cargando contrato desde acceso:", error);
        console.error("status:", error?.response?.status);
        console.error("data:", error?.response?.data);

        if (error?.response?.data?.alreadySigned) {
          const goHome = () => {
            sessionStorage.removeItem("proposal_resume_token");
            navigate("/");
          };

          sileo.action({
            title: "Pre-contrato ya firmado",
            description:
              error?.response?.data?.message ||
              "Este pre-contrato ya fue firmado anteriormente.",
            actionLabel: "Volver al inicio",
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
  }, [resumeToken, selectedMode, navigate]);

  const handleChangeMode = (mode: ProposalMode) => {
    setSelectedMode(mode);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", mode);
    setSearchParams(nextParams, { replace: true });
  };

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

      const goHome = () => {
        sessionStorage.removeItem("proposal_resume_token");
        navigate("/");
      };

      sileo.action({
        title: "Pre-contrato firmado correctamente",
        description: `Se han reservado ${response.data.reservationSummary.reservedKwp} kWp en ${response.data.reservationSummary.installationName}.`,
        actionLabel: "Ir al inicio",
        onAction: goHome,
        duration: 3500,
        icon: (
          <Icon
            icon="solar:shield-check-bold-duotone"
            className="h-5 w-5 text-emerald-600"
          />
        ),
      } as any);

      if (response.data.email?.status === "failed") {
        sileo.warning({
          title: "Contrato firmado, pero el email falló",
          description:
            response.data.email.error ??
            "No se pudo enviar la copia del contrato por correo.",
        });
      }

      window.setTimeout(() => {
        goHome();
      }, 2200);
    } catch (error: any) {
      console.error("Error firmando contrato:", error);
      console.error("status:", error?.response?.status);
      console.error("data:", error?.response?.data);

      if (error?.response?.data?.alreadySigned) {
        const goHome = () => {
          sessionStorage.removeItem("proposal_resume_token");
          navigate("/");
        };

        sileo.action({
          title: "Pre-contrato ya firmado",
          description:
            error?.response?.data?.message ||
            "Este pre-contrato ya fue firmado anteriormente.",
          actionLabel: "Volver al inicio",
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
        title: "No se pudo firmar el contrato",
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.16),transparent_24%)]" />
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <div className="rounded-[2rem] border border-brand-navy/5 bg-white px-8 py-10 shadow-2xl shadow-brand-navy/5 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-brand-navy" />
            <p className="font-bold text-brand-navy">
              Preparando tu contrato...
            </p>
            <p className="mt-2 text-sm text-brand-gray">
              Estamos cargando la modalidad seleccionada.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!generatedContract) {
    return null;
  }

  const modeLabel =
    selectedMode === "investment" ? "Inversión" : "Servicio";

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(87,217,211,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(148,194,255,0.18),transparent_28%),linear-gradient(to_bottom,rgba(7,0,95,0.02),rgba(7,0,95,0.01))]" />

      <div className="relative z-10 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {signedContractResult?.reservationSummary ? (
            <div className="rounded-[1.6rem] bg-emerald-50 border border-emerald-200 p-5">
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

          <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6">
            <div className="rounded-[2.4rem] bg-brand-navy text-white p-6 md:p-7 shadow-2xl shadow-brand-navy/15 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-44 h-44 bg-brand-mint/20 blur-3xl rounded-full -mr-14 -mt-14" />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/90">
                  <FileSignature className="h-4 w-4" />
                  Continuar contratación
                </div>

                <h1 className="mt-5 text-3xl md:text-4xl font-black leading-tight">
                  Revisa y firma
                  <br />
                  tu contrato
                </h1>

                <p className="mt-4 text-sm leading-6 text-white/75">
                  Has accedido desde una propuesta enviada previamente. Revisa
                  la modalidad seleccionada, comprueba el contrato y firma para
                  continuar con la reserva.
                </p>

                <div className="mt-7 space-y-4">
                  <div className="rounded-[1.5rem] bg-white/10 border border-white/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                      Titular
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {generatedContract.preview.client.nombre}{" "}
                      {generatedContract.preview.client.apellidos}
                    </p>
                    <p className="mt-1 text-sm text-white/70">
                      DNI: {generatedContract.preview.client.dni}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] bg-white/10 border border-white/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                      Instalación
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {generatedContract.preview.installation.nombre_instalacion}
                    </p>
                    <p className="mt-1 text-sm text-white/70 leading-6">
                      {generatedContract.preview.installation.direccion}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] bg-white/10 border border-white/10 p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/55">
                      Potencia asignada
                    </p>
                    <p className="mt-2 text-base font-bold">
                      {formatNumber(generatedContract.preview.assignedKwp)} kWp
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/85 hover:text-white transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver al inicio
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white border border-brand-navy/5 shadow-2xl shadow-brand-navy/5 overflow-hidden">
              <div className="border-b border-brand-navy/5 px-5 py-5 md:px-8 md:py-6 bg-white/95 backdrop-blur-md">
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-2">
                      Modalidad
                    </p>

                    <div className="inline-flex w-full rounded-[1.25rem] bg-brand-navy/[0.04] p-1.5 border border-brand-navy/5">
                      <button
                        type="button"
                        onClick={() => handleChangeMode("investment")}
                        disabled={loading || isSigningContract}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                          selectedMode === "investment"
                            ? "bg-brand-navy text-white shadow-md"
                            : "text-brand-navy/70 hover:text-brand-navy",
                        )}
                      >
                        <Wallet className="h-5 w-5" />
                        Inversión
                      </button>

                      <button
                        type="button"
                        onClick={() => handleChangeMode("service")}
                        disabled={loading || isSigningContract}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-[1rem] text-sm font-semibold transition-all",
                          selectedMode === "service"
                            ? "bg-brand-navy text-white shadow-md"
                            : "text-brand-navy/70 hover:text-brand-navy",
                        )}
                      >
                        <Zap className="h-5 w-5" />
                        Servicio
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[1.3rem] bg-brand-mint/10 border border-brand-mint/20 p-4 flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-brand-navy text-white flex items-center justify-center shrink-0">
                      {selectedMode === "investment" ? (
                        <Wallet className="h-5 w-5" />
                      ) : (
                        <Zap className="h-5 w-5" />
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-bold text-brand-navy">
                        Modalidad seleccionada: {modeLabel}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-brand-gray">
                        Al cambiar la modalidad se regenera la vista previa del
                        contrato con la opción elegida.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="p-4 md:p-8 border-b lg:border-b-0 lg:border-r border-brand-navy/5">
                  <div className="rounded-[1.5rem] overflow-hidden border border-brand-navy/5 bg-brand-sky/5">
                    <iframe
                      title="Vista previa del contrato"
                      srcDoc={generatedContract.previewHtml}
                      className="w-full h-[360px] sm:h-[460px] md:h-[620px] bg-white"
                    />
                  </div>
                </div>

                <div className="p-4 md:p-6 space-y-5 bg-brand-navy/[0.02]">
                  <div className="rounded-[1.4rem] bg-white border border-brand-navy/5 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-2">
                      Contrato
                    </p>
                    <p className="font-bold text-brand-navy">
                      {generatedContract.preview.contractNumber}
                    </p>
                    <p className="text-sm text-brand-gray mt-2">
                      {generatedContract.preview.client.nombre}{" "}
                      {generatedContract.preview.client.apellidos}
                    </p>
                    <p className="text-sm text-brand-gray">
                      DNI: {generatedContract.preview.client.dni}
                    </p>
                  </div>

                  <div className="rounded-[1.4rem] bg-white border border-brand-navy/5 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40">
                        Firma
                      </p>

                      <button
                        type="button"
                        onClick={clearSignature}
                        className="text-sm font-semibold text-brand-navy hover:text-brand-mint transition"
                      >
                        Limpiar
                      </button>
                    </div>

                    <canvas
                      ref={signatureCanvasRef}
                      width={600}
                      height={180}
                      className="w-full h-40 rounded-[1.2rem] border border-dashed border-brand-navy/20 bg-white touch-none"
                      onMouseDown={startSignatureDraw}
                      onMouseMove={moveSignatureDraw}
                      onMouseUp={endSignatureDraw}
                      onMouseLeave={endSignatureDraw}
                      onTouchStart={startSignatureDraw}
                      onTouchMove={moveSignatureDraw}
                      onTouchEnd={endSignatureDraw}
                    />

                    <p className="text-xs text-brand-gray mt-3 leading-relaxed">
                      Firma dentro del recuadro. Al confirmar, se generará el
                      PDF firmado y se enviará al backend para crear la reserva.
                    </p>
                  </div>

                  <div className="rounded-[1.4rem] bg-brand-mint/10 border border-brand-mint/20 p-4 text-brand-navy">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="h-5 w-5" />
                      <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/60">
                        Reserva provisional
                      </p>
                    </div>

                    <p className="text-sm leading-relaxed">
                      Al firmar, se reservarán{" "}
                      <span className="font-bold">
                        {formatNumber(generatedContract.preview.assignedKwp)} kWp
                      </span>{" "}
                      en la instalación seleccionada bajo modalidad de{" "}
                      <span className="font-bold">{modeLabel.toLowerCase()}</span>.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleSubmitSignedContract}
                      disabled={isSigningContract}
                      className="w-full rounded-[1.2rem] brand-gradient px-4 py-4 text-sm font-bold text-brand-navy transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 shadow-lg shadow-brand-mint/15"
                    >
                      {isSigningContract ? (
                        <span className="inline-flex items-center justify-center">
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          Firmando...
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center">
                          <PenLine className="mr-3 h-5 w-5" />
                          Firmar y reservar
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate("/")}
                      className="w-full rounded-[1.2rem] border border-brand-navy/10 bg-white px-4 py-4 text-sm font-bold text-brand-navy transition hover:bg-brand-navy/[0.02]"
                    >
                      Cancelar
                    </button>
                  </div>

                  {signatureHasContent ? (
                    <div className="rounded-[1.2rem] bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4" />
                        Firma detectada correctamente.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}