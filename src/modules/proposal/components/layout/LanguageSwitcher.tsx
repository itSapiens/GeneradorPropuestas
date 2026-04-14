import { useState } from "react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/src/lib/utils";

const LANGUAGES = [
  {
    code: "es",
    short: "ES",
    name: "Castellano",
    flag: "/flags/es.png",
  },
  {
    code: "ca",
    short: "CA",
    name: "Català",
    flag: "/flags/ca.png",
  },
  {
    code: "val",
    short: "VAL",
    name: "Valencià",
    flag: "/flags/val.png",
  },
  {
    code: "gl",
    short: "GL",
    name: "Galego",
    flag: "/flags/gal.png",
  },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed top-8 right-6 z-[101]">
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="group flex items-center justify-center w-14 h-14 rounded-2xl border border-white/40 bg-white/60 backdrop-blur-2xl shadow-[0_16px_40px_rgba(7,0,95,0.12)] hover:shadow-[0_20px_50px_rgba(7,0,95,0.16)] transition-all"
          aria-label="Seleccionar idioma"
          title="Seleccionar idioma"
        >
          <Icon
            icon="solar:global-bold-duotone"
            className="w-7 h-7 text-brand-navy group-hover:scale-110 transition-transform"
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute top-16 right-0 w-56 rounded-[1.8rem] border border-white/40 bg-white/70 backdrop-blur-2xl p-2 shadow-[0_20px_60px_rgba(7,0,95,0.15)]"
            >
              {LANGUAGES.map((lang) => {
                const active = i18n.language === lang.code;

                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      i18n.changeLanguage(lang.code);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-[1.2rem] px-3 py-3 text-left transition-all",
                      active
                        ? "brand-gradient text-brand-navy shadow-md"
                        : "text-brand-navy/75 hover:bg-white hover:text-brand-navy",
                    )}
                  >
                    <img
                      src={lang.flag}
                      alt={lang.name}
                      className="w-9 h-9 rounded-full object-cover border border-black/5"
                    />

                    <div className="flex flex-col leading-none">
                      <span className="text-sm font-extrabold tracking-[0.12em]">
                        {lang.short}
                      </span>
                      <span className="mt-1 text-[11px] font-medium opacity-70">
                        {lang.name}
                      </span>
                    </div>

                    <div className="ml-auto">
                      {active ? (
                        <Icon
                          icon="solar:check-circle-bold-duotone"
                          className="w-5 h-5 text-brand-navy"
                        />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}