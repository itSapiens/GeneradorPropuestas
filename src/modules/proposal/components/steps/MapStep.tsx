import { motion } from "motion/react";
import { Loader2, MapPin, TrendingUp } from "lucide-react";
import type { TFunction } from "i18next";

import { ClientInstallationsMap } from "@/src/components/shared/ClientInstallationsMap";
import { cn } from "@/src/lib/utils";
import {
  INSTALLATION_SEARCH_RADIUS_METERS,
} from "../../constants/proposal.constants";
// import {
//   normalizeInstallationModalidad,
//   getInstallationModeLabel,
// } from "../../utils/proposalModes";
import type { ApiInstallation } from "../types/proposal.types";
import { getInstallationModeLabel, normalizeInstallationModalidad } from "../utils/proposalModes";

type MapStepProps = {
  clientCoords: { lat: number; lng: number } | null;
  extractedAddress?: string;
  installations: ApiInstallation[];
  selectedInstallation: ApiInstallation | null;
  isLoadingInstallations: boolean;
  installationAvailabilityError:
    | "no_installations_in_radius"
    | "insufficient_capacity"
    | null;
  onSelectInstallation: (inst: ApiInstallation) => void;
  t: TFunction;
};

export default function MapStep({
  clientCoords,
  extractedAddress,
  installations,
  selectedInstallation,
  isLoadingInstallations,
  installationAvailabilityError,
  onSelectInstallation,
  t,
}: MapStepProps) {
  return (
    <motion.div
      key="map"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold mb-4">{t("map.title")}</h2>
        <p className="text-brand-gray">{t("map.description")}</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Mapa: full width, visible en móvil y escritorio */}
        <div className="w-full h-[380px] sm:h-[480px] lg:h-[540px] bg-[#F8FAFC] rounded-[3rem] overflow-hidden relative border border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
          {clientCoords ? (
            <ClientInstallationsMap
              clientLat={clientCoords.lat}
              clientLng={clientCoords.lng}
              clientLabel={t("map.clientLocation", "Tu ubicación")}
              radiusMeters={INSTALLATION_SEARCH_RADIUS_METERS}
              installations={installations.map((inst) => ({
                id: inst.id,
                lat: Number(inst.lat),
                lng: Number(inst.lng),
                name: inst.nombre_instalacion,
                address: inst.direccion,
                distanceMeters: inst.distance_meters ?? null,
              }))}
              selectedInstallationId={selectedInstallation?.id ?? null}
              onSelectInstallation={(id) => {
                const match = installations.find((i) => i.id === id);
                if (match) onSelectInstallation(match);
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-brand-navy/[0.02] text-brand-navy/40 font-bold">
              {t(
                "map.missingCoordinates",
                "No se ha podido cargar el mapa porque faltan coordenadas.",
              )}
            </div>
          )}

          <div className="absolute bottom-6 left-6 right-6 glass-card p-4 sm:p-6 rounded-3xl flex items-center justify-between z-[400]">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-navy rounded-2xl flex items-center justify-center text-white shrink-0">
                <MapPin className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                  {t("map.yourLocation")}
                </p>
                <p className="font-bold text-brand-navy text-sm sm:text-base truncate">
                  {extractedAddress ||
                    t("map.loadingAddress", "Cargando dirección...")}
                </p>
              </div>
            </div>

            <div className="shrink-0 px-3 py-1.5 bg-brand-mint/20 text-brand-navy text-[10px] font-bold rounded-full uppercase tracking-widest">
              {t("map.availableInstallations", {
                count: installations.length,
              })}
            </div>
          </div>
        </div>

        {/* Lista de instalaciones: debajo del mapa */}
        <div className="flex flex-col gap-4">
          <h3 className="font-bold text-xl text-brand-navy flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-mint" />
            {t("map.recommendedPlants")}
          </h3>

          {isLoadingInstallations ? (
            <div className="flex flex-col items-center justify-center py-12 text-brand-navy/40">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest">
                {t("map.searchingPlants")}
              </p>
            </div>
          ) : installations.length === 0 ? (
            <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-6 text-left">
              <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
                {installationAvailabilityError === "insufficient_capacity"
                  ? t(
                      "map.availability.noCapacityTitle",
                      "No hay capacidad suficiente disponible",
                    )
                  : t(
                      "map.availability.noInstallationsTitle",
                      "No hay instalaciones disponibles",
                    )}
              </p>

              <p className="text-sm text-amber-700/80 mt-3 leading-relaxed">
                {installationAvailabilityError === "insufficient_capacity"
                  ? t(
                      "map.availability.noCapacityDescription",
                      "Hemos encontrado instalaciones cercanas, pero ninguna dispone ahora mismo de la potencia necesaria para cubrir la recomendación de tu estudio. Contacta con Sapiens para revisar tu caso.",
                    )
                  : t(
                      "map.availability.noInstallationsDescription",
                      "No hemos encontrado instalaciones activas dentro del radio configurado para esta dirección. Contacta con Sapiens para revisar tu caso.",
                    )}
              </p>

              <div className="mt-4 space-y-1 text-sm font-semibold text-brand-navy">
                <p>{t("map.contactPhone", "Teléfono")}: 960 99 27 77</p>
                <p>{t("map.contactEmail", "Email")}: info@sapiensenergia.es</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {installations.map((inst, i) => {
                const normalizedMode = normalizeInstallationModalidad(
                  inst.modalidad,
                );
                const isSelected = selectedInstallation?.id === inst.id;
                const distanceKm =
                  typeof inst.distance_meters === "number"
                    ? inst.distance_meters / 1000
                    : null;

                return (
                  <motion.button
                    key={inst.id || i}
                    type="button"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => onSelectInstallation(inst)}
                    className={cn(
                      "w-full text-left p-6 rounded-[2rem] border transition-all bg-[#F8FAFC]",
                      isSelected
                        ? "border-brand-mint shadow-xl shadow-brand-mint/10"
                        : "border-brand-navy/5 hover:border-brand-mint/40 hover:shadow-xl hover:shadow-brand-navy/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-brand-navy truncate">
                          {inst.nombre_instalacion}
                        </p>
                        <p className="text-sm text-brand-gray mt-1 line-clamp-2">
                          {inst.direccion}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-full bg-brand-navy/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-navy">
                        {getInstallationModeLabel(normalizedMode, t)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <MetricChip
                        label={t("map.card.distance", "Distancia")}
                        value={
                          distanceKm !== null
                            ? `${distanceKm.toFixed(1)} km`
                            : "-"
                        }
                      />
                      <MetricChip
                        label={t("map.card.availablePower", "Potencia disponible")}
                        value={`${Math.round(Number(inst.available_kwp ?? 0))} kWp`}
                      />
                      <MetricChip
                        label={t("map.card.requiredPower", "Potencia estimada")}
                        value={`${Math.round(Number(inst.required_kwp ?? 0))} kWp`}
                      />
                      <MetricChip
                        label={t("map.card.effectiveHours", "Horas efectivas")}
                        value={`${Math.round(Number(inst.horas_efectivas ?? 0))} h`}
                      />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

type MetricChipProps = {
  label: string;
  value: string;
};

function MetricChip({ label, value }: MetricChipProps) {
  return (
    <div className="rounded-2xl bg-brand-navy/[0.03] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/40">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-brand-navy">{value}</p>
    </div>
  );
}