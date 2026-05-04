import React, { useState, useCallback } from "react";
import { Upload, FileText, X, ShieldCheck, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { sileo } from "sileo";
import { cn } from "@/src/shared/lib/utils";
import { useTranslation } from "react-i18next";

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  accept?: string[];
  maxSize?: number; // in MB
  disabled?: boolean;
  disabledMessage?: string;
}

export default function FileUploader({
  onFileSelect,
  accept = [".pdf", ".jpg", ".jpeg", ".png"],
  maxSize = 10,
  disabled = false,
  disabledMessage,
}: FileUploaderProps) {
  const { t } = useTranslation();

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const resolvedDisabledMessage =
    disabledMessage ?? t("fileUploader.disabledMessage");

  const showDisabledToast = useCallback(() => {
    sileo.action({
      title: t("fileUploader.toasts.privacyRequiredTitle"),
      description: t("fileUploader.toasts.privacyRequiredDescription"),
      button: {
        title: t("fileUploader.toasts.viewPolicy"),
        onClick: () => window.open("/politica-privacidad.html", "_blank"),
      },
    });
  }, [t]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) {
        setIsDragging(false);
        return;
      }
      setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = useCallback(
    (file: File) => {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;

      if (!accept.includes(extension)) {
        sileo.error({
          title: t("fileUploader.toasts.invalidFileTypeTitle"),
          description: t("fileUploader.toasts.invalidFileTypeDescription", {
            formats: accept.join(", "),
          }),
        });
        return false;
      }

      if (file.size > maxSize * 1024 * 1024) {
        sileo.error({
          title: t("fileUploader.toasts.fileTooLargeTitle"),
          description: t("fileUploader.toasts.fileTooLargeDescription", {
            maxSize,
          }),
        });
        return false;
      }

      return true;
    },
    [accept, maxSize, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) {
        showDisabledToast();
        return;
      }

      const droppedFile = e.dataTransfer.files[0];

      if (droppedFile && validateFile(droppedFile)) {
        setFile(droppedFile);
        onFileSelect(droppedFile);
      }
    },
    [disabled, onFileSelect, showDisabledToast, validateFile],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      showDisabledToast();
      e.target.value = "";
      return;
    }

    const selectedFile = e.target.files?.[0];

    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
      onFileSelect(selectedFile);
    }

    e.target.value = "";
  };

  const handleDisabledClick = () => {
    if (disabled) {
      showDisabledToast();
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  const uploadTitle = disabled
    ? t("fileUploader.titleDisabled")
    : isDragging
      ? t("fileUploader.titleDragging")
      : t("fileUploader.titleDefault");

  const uploadDescription = disabled
    ? resolvedDisabledMessage
    : t("fileUploader.description");

  return (
    <div className="w-full max-w-2xl mx-auto">
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleDisabledClick}
            className={cn(
              "relative rounded-3xl border-2 border-dashed transition-all duration-500 ease-out p-16 flex flex-col items-center justify-center gap-6 overflow-hidden",
              disabled
                ? "border-brand-navy/10 bg-brand-navy/[0.02] cursor-not-allowed opacity-70"
                : isDragging
                  ? "group cursor-pointer border-brand-mint bg-brand-mint/5 scale-[1.02] shadow-2xl shadow-brand-mint/10"
                  : "group cursor-pointer border-brand-navy/10 hover:border-brand-sky hover:bg-brand-sky/5 bg-[#F8FAFC] shadow-sm",
            )}
          >
            {!disabled && (
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                onChange={handleFileInput}
                accept={accept.join(",")}
              />
            )}

            <div
              className={cn(
                "w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg",
                disabled
                  ? "bg-brand-navy/5 text-brand-navy/30"
                  : isDragging
                    ? "brand-gradient text-brand-navy scale-110 rotate-6"
                    : "bg-brand-navy/5 text-brand-navy/40 group-hover:scale-110 group-hover:rotate-3",
              )}
            >
              {disabled ? (
                <Lock className="w-10 h-10" />
              ) : (
                <Upload className="w-10 h-10" />
              )}
            </div>

            <div className="text-center max-w-sm">
              <h3 className="text-2xl font-bold text-brand-navy leading-tight">
                {uploadTitle}
              </h3>

              <p className="text-brand-gray text-sm mt-3 font-medium leading-relaxed">
                {uploadDescription}
              </p>
            </div>

            <div className="flex gap-2 mt-2 flex-wrap justify-center">
              {accept.map((ext) => (
                <span
                  key={ext}
                  className="px-3 py-1 bg-brand-navy/5 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-navy/40 border border-brand-navy/5"
                >
                  {ext.replace(".", "")}
                </span>
              ))}
            </div>

            <div className="mt-8 pt-8 border-t border-brand-navy/5 w-full flex items-center justify-center gap-2 text-brand-navy/30">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                {t("fileUploader.secureMessage")}
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-brand-navy/10 bg-[#F8FAFC] p-8 flex items-center gap-6 shadow-xl shadow-brand-navy/5"
          >
            <div className="w-16 h-16 brand-gradient text-brand-navy rounded-2xl flex items-center justify-center shadow-lg shadow-brand-mint/20">
              <FileText className="w-8 h-8" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-brand-navy truncate">
                {file.name}
              </p>
              <p className="text-sm font-semibold text-brand-gray">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            <button
              type="button"
              onClick={removeFile}
              title={t("fileUploader.removeFile")}
              aria-label={t("fileUploader.removeFile")}
              className="w-10 h-10 rounded-xl hover:bg-red-50 flex items-center justify-center text-brand-navy/20 hover:text-red-500 transition-all duration-300"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}