import Button from "@/src/shared/ui/button/Button";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { GeneratedContractResponse } from "@/src/entities/proposal/domain/proposal.types";
import { TFunction } from "i18next";
// import type {
//   AppLanguage,
//   GeneratedContractResponse,
// } from "@/src/entities/proposal/domain/proposal.types";

interface ContractSigningModalProps {
  open: boolean;
  generatedContract: GeneratedContractResponse | null;
  isSigningContract: boolean;
  contractPreviewModeLabel: string;
  signalAmount: number;
  formatCurrency: (value: number) => string;
  signatureCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
  onClearSignature: () => void;
  onStartSignatureDraw: (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => void;
  onMoveSignatureDraw: (
    event:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>,
  ) => void;
  onEndSignatureDraw: () => void;
  onSubmitSignedContract: () => void;
  t: TFunction;
}

export default function ContractSigningModal({
  open,
  generatedContract,
  isSigningContract,
  contractPreviewModeLabel,
  signalAmount,
  formatCurrency,
  signatureCanvasRef,
  onClose,
  onClearSignature,
  onStartSignatureDraw,
  onMoveSignatureDraw,
  onEndSignatureDraw,
  onSubmitSignedContract,
  t,
}: ContractSigningModalProps) {
  return (
    <AnimatePresence>
      {open && generatedContract ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-brand-navy/50 backdrop-blur-sm overflow-y-auto"
        >
          <div className="min-h-full px-4 py-4 md:px-8 md:py-8 flex items-start md:items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="w-full max-w-5xl rounded-[2rem] md:rounded-[2.5rem] bg-[#F8FAFC] border border-brand-navy/5 shadow-2xl overflow-hidden"
            >
              <div className="max-h-[calc(100vh-2rem)] md:max-h-[92vh] overflow-y-auto">
                <div className="sticky top-0 z-20 px-5 md:px-8 py-5 border-b border-brand-navy/5 bg-[#F8FAFC]/95 backdrop-blur-md flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40 mb-1">
                      {t("contractFlow.modal.badge", "Contratación")}
                    </p>
                    <h3 className="text-xl md:text-2xl font-bold text-brand-navy">
                      {t("contractFlow.leftPanel.titleLine1", "Revisa y firma")}{" "}
                      {t("contractFlow.leftPanel.titleLine2", "tu contrato")}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-11 h-11 rounded-2xl bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition shrink-0"
                    aria-label={t("common.close", "Cerrar")}
                  >
                    ✕
                  </button>
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
                        className="w-full h-[320px] sm:h-[420px] md:h-[560px] bg-[#F8FAFC]"
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
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-navy/40">
                          {t("contractFlow.signature.title", "Firma")}
                        </p>

                        <button
                          type="button"
                          onClick={onClearSignature}
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
                        onMouseDown={onStartSignatureDraw}
                        onMouseMove={onMoveSignatureDraw}
                        onMouseUp={onEndSignatureDraw}
                        onMouseLeave={onEndSignatureDraw}
                        onTouchStart={onStartSignatureDraw}
                        onTouchMove={onMoveSignatureDraw}
                        onTouchEnd={onEndSignatureDraw}
                      />

                      <p className="text-xs text-brand-gray mt-3 leading-relaxed">
                        {t(
                          "contractFlow.signature.help",
                          "Firma dentro del recuadro. Al confirmar, se generará el PDF firmado, se creará tu reserva provisional y podrás elegir la forma de pago.",
                        )}
                      </p>
                    </div>

                    <div className="rounded-[1.4rem] bg-brand-mint/10 border border-brand-mint/20 p-4 text-brand-navy">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon
                          icon="solar:bolt-bold-duotone"
                          className="h-5 w-5"
                        />
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
                          "Al firmar, se reservarán {{assignedKwp}} kWp en la instalación seleccionada bajo la modalidad de {{modeLabel}}.",
                          {
                            assignedKwp: generatedContract.preview.assignedKwp,
                            modeLabel: contractPreviewModeLabel,
                          },
                        )}
                      </p>

                      <div className="mt-3 pt-3 border-t border-brand-mint/30 flex items-center justify-between">
                        <p className="text-sm font-bold text-brand-navy/70">
                          {t("contractFlow.reservation.signalLabel", "Pago de reserva")}
                        </p>
                        <p className="text-lg font-bold text-brand-navy">
                          {formatCurrency(signalAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="sticky bottom-0 bg-brand-navy/[0.02] pt-2">
                      <div className="space-y-3">
                        <Button
                          className="w-full py-5 rounded-[1.2rem] brand-gradient text-brand-navy border-none"
                          onClick={onSubmitSignedContract}
                          disabled={isSigningContract}
                        >
                          {isSigningContract ? (
                            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          ) : (
                            <Icon
                              icon="solar:shield-check-bold-duotone"
                              className="mr-3 h-5 w-5"
                            />
                          )}
                          {isSigningContract
                            ? t("contractFlow.actions.signing", "Firmando...")
                            : t(
                                "contractFlow.actions.signAndContinue",
                                "Firmar y continuar",
                              )}
                        </Button>

                        <Button
                          variant="outline"
                          className="w-full py-5 rounded-[1.2rem] border-brand-navy/10 text-brand-navy"
                          onClick={onClose}
                        >
                          {t("common.cancel", "Cancelar")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
