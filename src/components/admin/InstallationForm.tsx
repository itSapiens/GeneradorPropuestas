import React, { useState } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MapPin,
  Search,
  Loader2,
  X,
  Save,
  Zap,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { sileo } from "sileo";
import axios from "axios";
import { motion } from "motion/react";

// Fix Leaflet icon issue
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

const numericField = () =>
  z.number().refine((value) => Number.isFinite(value), {
    message: "Debe ser un número válido",
  });
const InstallationFormSchema = z.object({
  nombre_instalacion: z.string().min(1, "El nombre es obligatorio"),
  direccion: z.string().min(1, "La dirección es obligatoria"),
  lat: numericField(),
  lng: numericField(),
  horas_efectivas: numericField().positive("Debe ser mayor que 0"),
  potencia_instalada_kwp: numericField().nonnegative("Debe ser 0 o mayor"),
  almacenamiento_kwh: numericField().nonnegative("Debe ser 0 o mayor"),
  coste_anual_mantenimiento_por_kwp:
    numericField().nonnegative("Debe ser 0 o mayor"),
  coste_kwh_inversion: numericField().nonnegative("Debe ser 0 o mayor"),
  coste_kwh_servicio: numericField().nonnegative("Debe ser 0 o mayor"),
  porcentaje_autoconsumo: numericField()
    .min(0, "Debe ser 0 o mayor")
    .max(100, "Debe ser 100 o menor"),
  modalidad: z.enum(["Inversion", "Servicio", "Ambas"]),
  active: z.boolean(),
});

type InstallationFormValues = z.infer<typeof InstallationFormSchema>;

interface InstallationRecord extends InstallationFormValues {
  id: string;
  created_at?: string;
  updated_at?: string;
}

interface InstallationFormProps {
  onClose: () => void;
  onSuccess: () => void;
  initialData?: InstallationRecord;
}

function MapEvents({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

function normalizeAutoconsumoForDb(value: number): number {
  return value > 1 ? value / 100 : value;
}

function displayAutoconsumoForInput(value?: number): number {
  if (typeof value !== "number") return 80;
  return value <= 1 ? value * 100 : value;
}

export default function InstallationForm({
  onClose,
  onSuccess,
  initialData,
}: InstallationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const defaultLat = initialData?.lat ?? 40.4168;
  const defaultLng = initialData?.lng ?? -3.7038;

  const [mapCenter, setMapCenter] = useState<[number, number]>([
    defaultLat,
    defaultLng,
  ]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<InstallationFormValues>({
    resolver: zodResolver(InstallationFormSchema),
    defaultValues: initialData
      ? {
          nombre_instalacion: initialData.nombre_instalacion,
          direccion: initialData.direccion,
          lat: initialData.lat,
          lng: initialData.lng,
          horas_efectivas: initialData.horas_efectivas,
          potencia_instalada_kwp: initialData.potencia_instalada_kwp,
          almacenamiento_kwh: initialData.almacenamiento_kwh,
          coste_anual_mantenimiento_por_kwp:
            initialData.coste_anual_mantenimiento_por_kwp,
          coste_kwh_inversion: initialData.coste_kwh_inversion,
          coste_kwh_servicio: initialData.coste_kwh_servicio,
          porcentaje_autoconsumo: displayAutoconsumoForInput(
            initialData.porcentaje_autoconsumo,
          ),
          modalidad: initialData.modalidad,
          active: initialData.active,
        }
      : {
          nombre_instalacion: "",
          direccion: "",
          lat: 40.4168,
          lng: -3.7038,
          horas_efectivas: 1800,
          potencia_instalada_kwp: 0,
          almacenamiento_kwh: 0,
          coste_anual_mantenimiento_por_kwp: 0,
          coste_kwh_inversion: 0,
          coste_kwh_servicio: 0,
          porcentaje_autoconsumo: 80,
          modalidad: "Ambas",
          active: true,
        },
  });

  const lat = watch("lat");
  const lng = watch("lng");

  const handleLocationSelect = (newLat: number, newLng: number) => {
    setValue("lat", newLat, { shouldValidate: true, shouldDirty: true });
    setValue("lng", newLng, { shouldValidate: true, shouldDirty: true });
    setMapCenter([newLat, newLng]);
  };

  const handleSearchAddress = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);

    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchQuery,
        )}`,
      );

      if (response.data && response.data.length > 0) {
        const first = response.data[0];
        const newLat = parseFloat(first.lat);
        const newLng = parseFloat(first.lon);

        setMapCenter([newLat, newLng]);
        handleLocationSelect(newLat, newLng);

        if (first.display_name) {
          setValue("direccion", first.display_name, {
            shouldValidate: true,
            shouldDirty: true,
          });
        }
      } else {
        sileo.error({
          title: "No se encontró la dirección",
          description: "Prueba con una dirección más específica",
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      sileo.error({
        title: "Error al buscar la dirección",
        description: "Inténtalo de nuevo más tarde",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const onSubmit: SubmitHandler<InstallationFormValues> = async (data) => {
    setIsSubmitting(true);

    try {
      const payload = {
        ...data,
        porcentaje_autoconsumo: normalizeAutoconsumoForDb(
          data.porcentaje_autoconsumo,
        ),
      };

      console.log("Payload instalación:", payload);

      if (initialData?.id) {
        await axios.put(`/api/installations/${initialData.id}`, payload);
        sileo.success({ title: "Instalación actualizada con éxito" });
      } else {
        await axios.post("/api/installations", payload);
        sileo.success({ title: "Instalación creada con éxito" });
      }

      onSuccess();
    } catch (error: any) {
      console.error("Submit error completo:", error);
      console.error("Status:", error?.response?.status);
      console.error("Data:", error?.response?.data);

      const message =
        error?.response?.data?.details ||
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Error al guardar la instalación";

      sileo.error({
        title: "No se pudo guardar la instalación",
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-8 border-b border-brand-navy/5 flex justify-between items-center bg-brand-navy/[0.02]">
          <div>
            <h2 className="text-2xl font-bold text-brand-navy">
              {initialData ? "Editar Instalación" : "Nueva Instalación"}
            </h2>
            <p className="text-xs font-bold text-brand-navy/40 uppercase tracking-widest mt-1">
              Configura los parámetros de la planta solar
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-brand-navy/5 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-brand-navy/40" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <form
            id="installation-form"
            onSubmit={handleSubmit(onSubmit)}
            className="grid grid-cols-1 lg:grid-cols-2 gap-10"
          >
            {/* Inputs ocultos para asegurar que RHF registre estos campos */}
            <input
              type="hidden"
              {...register("lat", { valueAsNumber: true })}
            />
            <input
              type="hidden"
              {...register("lng", { valueAsNumber: true })}
            />

            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-brand-navy uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-4 h-4 text-brand-mint" />
                  Información básica
                </h3>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                    Nombre instalación
                  </label>
                  <Input
                    {...register("nombre_instalacion")}
                    placeholder="Ej: EcoSolar Madrid"
                    error={errors.nombre_instalacion?.message}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                    Dirección
                  </label>
                  <Input
                    {...register("direccion")}
                    placeholder="Calle, número, ciudad"
                    error={errors.direccion?.message}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-brand-navy uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-mint" />
                  Parámetros técnicos
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Horas efectivas
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register("horas_efectivas", { valueAsNumber: true })}
                      error={errors.horas_efectivas?.message}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Potencia instalada (kWp)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register("potencia_instalada_kwp", {
                        valueAsNumber: true,
                      })}
                      error={errors.potencia_instalada_kwp?.message}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Almacenamiento (kWh)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register("almacenamiento_kwh", {
                        valueAsNumber: true,
                      })}
                      error={errors.almacenamiento_kwh?.message}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      % Autoconsumo
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register("porcentaje_autoconsumo", {
                        valueAsNumber: true,
                      })}
                      error={errors.porcentaje_autoconsumo?.message}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-brand-navy uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-mint" />
                  Costes
                </h3>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Inversión
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      {...register("coste_kwh_inversion", {
                        valueAsNumber: true,
                      })}
                      error={errors.coste_kwh_inversion?.message}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Servicio
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      {...register("coste_kwh_servicio", {
                        valueAsNumber: true,
                      })}
                      error={errors.coste_kwh_servicio?.message}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Mantenimiento anual
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      {...register("coste_anual_mantenimiento_por_kwp", {
                        valueAsNumber: true,
                      })}
                      error={errors.coste_anual_mantenimiento_por_kwp?.message}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-brand-navy uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-brand-mint" />
                  Ubicación y mapa
                </h3>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/20" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSearchAddress();
                        }
                      }}
                      placeholder="Buscar dirección o calle..."
                      className="w-full pl-12 pr-6 py-3 rounded-2xl border border-brand-navy/5 bg-brand-navy/[0.02] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-mint/20"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={handleSearchAddress}
                    disabled={isSearching}
                    className="rounded-2xl px-6"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Buscar"
                    )}
                  </Button>
                </div>

                <div className="h-[300px] rounded-[2rem] overflow-hidden border border-brand-navy/5 relative z-0">
                  <MapContainer
                    center={mapCenter}
                    zoom={13}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[lat, lng]} />
                    <MapEvents onLocationSelect={handleLocationSelect} />
                    <ChangeView center={mapCenter} />
                  </MapContainer>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Longitud
                    </label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={lng}
                      readOnly
                      className="bg-brand-navy/5"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                      Latitud
                    </label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={lat}
                      readOnly
                      className="bg-brand-navy/5"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                    Modalidad
                  </label>

                  <Controller
                    control={control}
                    name="modalidad"
                    render={({ field }) => (
                      <select
                        {...field}
                        className="w-full px-6 py-4 rounded-2xl border border-brand-navy/5 bg-brand-navy/[0.02] text-sm font-bold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-mint/20"
                      >
                        <option value="Inversion">Inversión</option>
                        <option value="Servicio">Servicio</option>
                        <option value="Ambas">Ambas</option>
                      </select>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-brand-navy/40 uppercase tracking-widest ml-4">
                    Estado
                  </label>

                  <Controller
                    control={control}
                    name="active"
                    render={({ field }) => (
                      <select
                        value={field.value ? "activa" : "inactiva"}
                        onChange={(e) =>
                          field.onChange(e.target.value === "activa")
                        }
                        className="w-full px-6 py-4 rounded-2xl border border-brand-navy/5 bg-brand-navy/[0.02] text-sm font-bold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-mint/20"
                      >
                        <option value="activa">Activa</option>
                        <option value="inactiva">Inactiva</option>
                      </select>
                    )}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="p-8 border-t border-brand-navy/5 bg-brand-navy/[0.02] flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-2xl px-8 font-bold"
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            form="installation-form"
            disabled={isSubmitting}
            className="brand-gradient text-brand-navy border-none rounded-2xl px-12 font-bold shadow-xl shadow-brand-mint/20"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                <Save className="w-5 h-5" />
                {initialData ? "Guardar Cambios" : "Crear Instalación"}
              </span>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
