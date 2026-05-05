import Button from "@/src/shared/ui/button/Button";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "@iconify/react";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/src/shared/lib/utils";
import { AppLanguage, SignedContractResponse } from "@/src/entities/proposal/domain/proposal.types";
import { getDateLocale } from "@/src/features/proposal-flow/lib/proposalNumbers";
import { TFunction } from "i18next";

interface PaymentMethodModalProps {
  open: boolean;
  signedContractResult: SignedContractResponse | null;
  isSelectingPaymentMethod: boolean;
  currentAppLanguage: AppLanguage;
  onClose: () => void;
  onSelectBankTransferPayment: () => void;
  onSelectStripePayment: () => void;
  t: TFunction;
}

export default function PaymentMethodModal({
  open,
  signedContractResult,
  isSelectingPaymentMethod,
  currentAppLanguage,
  onClose,
  onSelectBankTransferPayment,
  t,
}: PaymentMethodModalProps) {
  return (
    <AnimatePresence>
      {open && signedContractResult ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[210] bg-brand-navy/50 backdrop-blur-sm overflow-y-auto"
        >
          <div className="min-h-full px-4 py-4 md:px-8 md:py-8 flex items-start md:items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="w-full max-w-3xl rounded-[2rem] md:rounded-[2.5rem] bg-[#F8FAFC] border border-brand-navy/5 shadow-2xl overflow-hidden"
            >
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
                  onClick={onClose}
                  className="w-11 h-11 rounded-2xl bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy transition shrink-0"
                  disabled={isSelectingPaymentMethod}
                  aria-label={t("common.close", "Cerrar")}
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
                        {t("contractFlow.modal.installation", "Instalación")}:
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
                      {formatCurrency(
                        signedContractResult.reservation.signalAmount,
                      )}
                    </p>
                    <p>
                      <span className="font-bold text-brand-navy">
                        {t("contractFlow.modal.deadline", "Fecha límite")}:
                      </span>{" "}
                      {new Date(
                        signedContractResult.reservation.paymentDeadlineAt,
                      ).toLocaleDateString(getDateLocale(currentAppLanguage))}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                  <button
                    type="button"
                    onClick={onSelectBankTransferPayment}
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
                  <Button
                    variant="outline"
                    className="w-full py-5 rounded-[1.2rem] border-brand-navy/10 text-brand-navy"
                    onClick={onClose}
                    disabled={isSelectingPaymentMethod}
                  >
                    {isSelectingPaymentMethod ? (
                      <>
                        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                        {t("common.processing", "Procesando...")}
                      </>
                    ) : (
                      t("common.close", "Cerrar")
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
