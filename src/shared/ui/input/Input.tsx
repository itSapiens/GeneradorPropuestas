import React, { InputHTMLAttributes } from "react";
import { cn } from "@/src/shared/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ className, label, error, ...props }: InputProps) {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-semibold text-black/40 uppercase tracking-wider ml-1">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full px-4 py-3 rounded-xl border border-brand-navy/10 bg-[#F8FAFC] text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-sky/20 focus:border-brand-sky placeholder:text-brand-navy/20",
          error && "border-red-500 focus:ring-red-500/20 focus:border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-[10px] font-medium text-red-500 ml-1">{error}</p>}
    </div>
  );
}
