import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { cn } from "../../lib/utils";

type SelectOption = {
  value: string;
  label: string;
};

interface SelectFieldProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Selecciona una opción",
  error,
  disabled = false,
  className,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className={cn("space-y-2 w-full", className)} ref={containerRef}>
      <label className="text-xs font-bold uppercase tracking-[0.2em] text-brand-navy/50">
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          className={cn(
            "w-full h-[58px] rounded-2xl border bg-[#F8FAFC] px-5 text-left",
            "flex items-center justify-between gap-3",
            "transition-all duration-200 outline-none shadow-sm",
            "border-brand-navy/10 hover:border-brand-mint/50",
            "focus:border-brand-mint focus:ring-2 focus:ring-brand-mint/20",
            disabled && "opacity-60 cursor-not-allowed bg-brand-navy/[0.03]",
            open && "border-brand-mint ring-2 ring-brand-mint/20",
            error && "border-red-400 ring-0 focus:border-red-400 focus:ring-red-200",
          )}
        >
          <span
            className={cn(
              "truncate text-base",
              selectedOption ? "text-brand-navy" : "text-brand-navy/40",
            )}
          >
            {selectedOption?.label || placeholder}
          </span>

          <Icon
            icon={open ? "solar:alt-arrow-up-line-duotone" : "solar:alt-arrow-down-line-duotone"}
            className="h-5 w-5 shrink-0 text-brand-navy/55"
          />
        </button>

        {open && !disabled && (
          <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-2xl border border-brand-navy/10 bg-[#F8FAFC] shadow-2xl shadow-brand-navy/10">
            <div className="p-2">
              {options.map((option) => {
                const isActive = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all",
                      "flex items-center justify-between gap-3",
                      isActive
                        ? "bg-brand-navy text-white"
                        : "text-brand-navy hover:bg-brand-sky/10",
                    )}
                  >
                    <span>{option.label}</span>

                    {isActive ? (
                      <Icon
                        icon="solar:check-circle-bold-duotone"
                        className="h-5 w-5 shrink-0"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}