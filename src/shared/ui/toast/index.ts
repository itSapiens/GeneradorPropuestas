import type { ReactNode } from "react";
import { toast } from "sonner";

type ToastKind = "success" | "error" | "warning" | "info" | "action";
type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

type ToastButton = {
  title: string;
  onClick: () => void;
};

type ToastOptions = {
  title?: ReactNode | string;
  description?: ReactNode | string;
  duration?: number | null;
  position?: ToastPosition;
  button?: ToastButton;
};

type PromiseToastOptions<T = unknown> = {
  loading: ToastOptions;
  success: ToastOptions | ((data: T) => ToastOptions);
  error: ToastOptions | ((error: unknown) => ToastOptions);
};

function toastTitle(options: ToastOptions) {
  return options.title ?? options.description ?? "";
}

function toastData(options: ToastOptions) {
  return {
    description: options.title ? options.description : undefined,
    duration: options.duration ?? undefined,
    position: options.position,
    action: options.button
      ? {
          label: options.button.title,
          onClick: options.button.onClick,
        }
      : undefined,
  };
}

function show(kind: ToastKind, options: ToastOptions) {
  const title = toastTitle(options);
  const data = toastData(options);

  if (kind === "action") return toast(title, data);
  return toast[kind](title, data);
}

function resolvePromiseOptions<T>(
  value: ToastOptions | ((data: T) => ToastOptions),
  data: T,
) {
  return typeof value === "function" ? value(data) : value;
}

function promiseResult(options: ToastOptions) {
  return {
    message: toastTitle(options),
    description: options.description,
  };
}

export const sileo = {
  show: (options: ToastOptions) => toast(toastTitle(options), toastData(options)),
  success: (options: ToastOptions) => show("success", options),
  error: (options: ToastOptions) => show("error", options),
  warning: (options: ToastOptions) => show("warning", options),
  info: (options: ToastOptions) => show("info", options),
  action: (options: ToastOptions) => show("action", options),
  dismiss: (id?: string | number) => toast.dismiss(id),
  clear: () => toast.dismiss(),
  promise: async <T>(
    promiseOrFactory: Promise<T> | (() => Promise<T>),
    options: PromiseToastOptions<T>,
  ) => {
    const promise =
      typeof promiseOrFactory === "function" ? promiseOrFactory() : promiseOrFactory;

    toast.promise(promise, {
      loading: toastTitle(options.loading),
      success: (data) => {
        const resolved = resolvePromiseOptions(options.success, data);
        return promiseResult(resolved);
      },
      error: (error) => {
        const resolved = resolvePromiseOptions(options.error, error);
        return promiseResult(resolved);
      },
      description: options.loading.description,
    });

    return promise;
  },
};

export { toast };
