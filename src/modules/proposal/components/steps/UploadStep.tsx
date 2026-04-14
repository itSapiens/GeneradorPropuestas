import { motion } from "motion/react";
import { Trans } from "react-i18next";
import FileUploader from "@/src/components/shared/FileUploader";
import type { AppLanguage } from "../types/proposal.types";
import { TFunction } from "i18next";

type UploadStepProps = {
  privacyAccepted: boolean;
  setPrivacyAccepted: React.Dispatch<React.SetStateAction<boolean>>;
  onFileSelect: (file: File) => Promise<void>;
  currentAppLanguage: AppLanguage;
  t:TFunction;
};

export default function UploadStep({
  privacyAccepted,
  setPrivacyAccepted,
  onFileSelect,
  currentAppLanguage,
  t,
}: UploadStepProps) {
  return (
    <motion.div
      key="upload"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="text-center"
    >
      <div className="max-w-2xl mx-auto mb-8 text-left">
        <label className="flex items-start gap-3 rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            className="mt-1 h-5 w-5 rounded border-brand-navy/20 text-brand-mint focus:ring-brand-mint"
          />

          <span className="text-sm text-brand-gray leading-relaxed">
            <Trans
              i18nKey="upload.privacyConsent"
              components={{
                privacyLink: (
                  <a
                    href={`/politica-privacidad.html?lang=${currentAppLanguage}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-navy underline underline-offset-4 hover:text-brand-mint"
                  />
                ),
              }}
            />
          </span>
        </label>
      </div>

      <FileUploader
        onFileSelect={onFileSelect}
        disabled={!privacyAccepted}
        disabledMessage={t("upload.disabledMessage")}
      />
    </motion.div>
  );
}