import React, { useState, useEffect } from "react";
import Layout from "./components/shared/Layout";
import FileUploader from "./components/shared/FileUploader";
import Button from "./components/ui/Button";
import Input from "./components/ui/Input";
import AdminLogin from "./components/admin/AdminLogin";
import AdminDashboard from "./components/admin/AdminDashboard";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BillDataSchema, type BillData } from "./lib/validators";
import { motion, AnimatePresence } from "motion/react";
import { extractBillFromApi } from "./services/extractionApiService";
import type { ExtractedBillData, BillType } from "./services/geminiService";
import {
  Check,
  MapPin,
  Zap,
  FileText,
  ArrowRight,
  Loader2,
  Download,
  Mail,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Leaf,
  Upload,
  Building2,
  BatteryCharging,
} from "lucide-react";
import { sileo } from "sileo";
import axios from "axios";
import { calculateEnergyStudy, type CalculationResult } from "./modules/calculation/energyService";
import { formatCurrency, formatNumber, cn } from "./lib/utils";
import { generateStudyPDF } from "./modules/pdf/pdfService";
import { sendStudyByEmail } from "./modules/email/emailService";

type Step = "upload" | "validation" | "map" | "calculation" | "result";

interface ApiInstallation {
  id: string;
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  horas_efectivas: number;
  potencia_instalada_kwp: number;
  almacenamiento_kwh: number;
  coste_anual_mantenimiento_por_kwp: number;
  coste_kwh_inversion: number;
  coste_kwh_servicio: number;
  porcentaje_autoconsumo: number;
  modalidad: "inversion" | "servicio" | "ambas";
  active: boolean;
  created_at?: string;
  updated_at?: string;
  distance_meters?: number;
}

function buildLastName(lastname1: string | null, lastname2: string | null): string {
  return [lastname1, lastname2].filter(Boolean).join(" ").trim();
}

function normalizeSelfConsumption(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.7;
  return value > 1 ? value / 100 : value;
}

function displayPercentage(value: number | null | undefined): number {
  const normalized = normalizeSelfConsumption(value);
  return Math.round(normalized * 100);
}

function mapExtractedToBillData(data: ExtractedBillData): Partial<BillData> {
  const fullLastName = buildLastName(data.customer.lastname1, data.customer.lastname2);

  return {
    name: data.customer.name ?? "",
    lastName: fullLastName,
    dni: data.customer.dni ?? "",
    cups: data.customer.cups ?? "",
    address: data.location.address ?? "",
    email: data.customer.email ?? "",
    phone: data.customer.phone ?? "",
    monthlyConsumption:
      data.invoice_data.averageMonthlyConsumptionKwh ??
      data.invoice_data.consumptionKwh ??
      undefined,
    billType: (data.invoice_data.type as BillType) ?? undefined,
    iban: data.customer.iban ?? "",
  } as Partial<BillData>;
}

export default function App() {
  const [view, setView] = useState<"public" | "admin">("public");
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<BillData> | null>(null);
  const [rawExtraction, setRawExtraction] = useState<ExtractedBillData | null>(null);
  const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
  const [installations, setInstallations] = useState<ApiInstallation[]>([]);
  const [selectedInstallation, setSelectedInstallation] = useState<ApiInstallation | null>(null);
  const [isLoadingInstallations, setIsLoadingInstallations] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<BillData>({
    resolver: zodResolver(BillDataSchema),
  });

  const handleDownloadPDF = async () => {
    if (!calculationResult || !extractedData) return;

    sileo.promise(
      (async () => {
        const doc = generateStudyPDF(extractedData as BillData, calculationResult);
        doc.save(`Estudio_Solar_${extractedData.name || "cliente"}.pdf`);
      })(),
      {
        loading: { title: "Generando tu estudio en PDF..." },
        success: { title: "PDF generado y descargado con éxito" },
        error: { title: "No se pudo generar el PDF" },
      }
    );
  };

  const handleSendEmail = async () => {
    if (!calculationResult || !extractedData?.email) {
      sileo.error({
        title: "Falta el email del cliente",
        description: "Añade un correo válido antes de enviarlo.",
      });
      return;
    }

    sileo.promise(
      sendStudyByEmail(
        extractedData.email,
        extractedData.name || "Cliente",
        "https://example.com/study.pdf"
      ),
      {
        loading: { title: "Enviando estudio por email..." },
        success: { title: "Estudio enviado por email con éxito" },
        error: { title: "No se pudo enviar el email" },
      }
    );
  };

  const handleFileSelect = async (file: File) => {
    setIsExtracting(true);

    sileo
      .promise(
        (async () => {
          const extraction = await extractBillFromApi(file);
          const mappedData = mapExtractedToBillData(extraction);

          setRawExtraction(extraction);
          setExtractedData(mappedData);

          if (mappedData.name) setValue("name", mappedData.name as string);
          if (mappedData.lastName) setValue("lastName", mappedData.lastName as string);
          if (mappedData.dni) setValue("dni", mappedData.dni as string);
          if (mappedData.cups) setValue("cups", mappedData.cups as string);
          // if (mappedData.cups) setValue("cups", mappedData.cups as string);
          if (mappedData.address) setValue("address", mappedData.address as string);
          if (mappedData.email) setValue("email", mappedData.email as string);
          if (mappedData.phone) setValue("phone", mappedData.phone as string);
          if (mappedData.cups) setValue("cups", mappedData.cups as string);
          if (mappedData.iban) setValue("iban", mappedData.iban as string);

          if (typeof mappedData.monthlyConsumption === "number") {
            setValue("monthlyConsumption", mappedData.monthlyConsumption as number);
          }
          if (mappedData.billType) {
            setValue("billType", mappedData.billType as BillData["billType"]);
          }
          if (mappedData.iban) {
            setValue("iban" as keyof BillData, mappedData.iban as BillData[keyof BillData]);
          }

          setCurrentStep("validation");

          if (extraction.extraction.fallbackUsed) {
            sileo.info({
              title: "Extracción completada con apoyo del fallback",
              description: "Revisa los datos detectados antes de continuar.",
            });
          }

          return extraction;
        })(),
        {
          loading: { title: "Procesando factura..." },
          success: { title: "Factura procesada con éxito" },
          error: { title: "No se pudo extraer la información de la factura" },
        }
      )
      .finally(() => {
        setIsExtracting(false);
      });
  };

  const onValidationSubmit = (data: BillData) => {
    setExtractedData(data);
    setCurrentStep("map");
    fetchInstallations();
    sileo.success({ title: "Datos validados correctamente" });
  };

  const fetchInstallations = async () => {
    setIsLoadingInstallations(true);
    try {
      const response = await axios.get<ApiInstallation[]>("/api/installations");
      setInstallations(response.data);
    } catch (error) {
      console.error("Error fetching installations:", error);
      sileo.error({
        title: "Error al cargar instalaciones",
        description: "Inténtalo de nuevo más tarde",
      });
    } finally {
      setIsLoadingInstallations(false);
    }
  };

  const handleInstallationSelect = (inst: ApiInstallation) => {
    setSelectedInstallation(inst);
    setCurrentStep("calculation");
  };

  useEffect(() => {
    if (currentStep === "calculation") {
      const timer = setTimeout(() => {
        if (extractedData && selectedInstallation) {
          const result = calculateEnergyStudy({
            monthlyConsumptionKwh: extractedData.monthlyConsumption || 0,
            billType: extractedData.billType || "2TD",
            effectiveHours: selectedInstallation.horas_efectivas,
            investmentCostKwh: selectedInstallation.coste_kwh_inversion,
            serviceCostKwh: selectedInstallation.coste_kwh_servicio,
            selfConsumptionRatio: normalizeSelfConsumption(
              selectedInstallation.porcentaje_autoconsumo
            ),
          });

          setCalculationResult(result);
          setCurrentStep("result");
          sileo.success({ title: "Estudio generado con éxito" });
        }
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [currentStep, extractedData, selectedInstallation]);

  return (
    <Layout>
      <div className="fixed bottom-8 right-8 z-[100]">
        <Button
          variant="ghost"
          size="sm"
          className="glass-card rounded-full px-6 py-3 font-bold text-brand-navy/60 hover:text-brand-navy border-brand-navy/5 shadow-xl"
          onClick={() => setView(view === "public" ? "admin" : "public")}
        >
          {view === "public" ? "Acceso Admin" : "Volver a la Web"}
        </Button>
      </div>

      <div className="max-w-7xl mx-auto">
        {view === "admin" ? (
          !isAdminLoggedIn ? (
            <AdminLogin onLogin={() => setIsAdminLoggedIn(true)} />
          ) : (
            <AdminDashboard />
          )
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="mb-12 md:mb-20 relative px-4">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-brand-navy/5 -translate-y-1/2 rounded-full" />
              <div className="relative flex justify-between items-center">
                {[
                  { label: "Subida", icon: Upload },
                  { label: "Validación", icon: FileText },
                  { label: "Ubicación", icon: MapPin },
                  { label: "Resultado", icon: Zap },
                ].map((step, i) => {
                  const steps = ["upload", "validation", "map", "result"];
                  const currentIndex = steps.indexOf(
                    currentStep === "calculation" ? "map" : currentStep
                  );
                  const isActive = i <= currentIndex;
                  const isCurrent = i === currentIndex;

                  return (
                    <div
                      key={step.label}
                      className="flex flex-col items-center gap-3 md:gap-4 relative z-10"
                    >
                      <div
                        className={cn(
                          "w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center transition-all duration-700 shadow-lg",
                          isActive
                            ? "brand-gradient text-brand-navy scale-110 shadow-brand-mint/20"
                            : "bg-white border-2 border-brand-navy/5 text-brand-navy/20"
                        )}
                      >
                        {isActive && i < currentIndex ? (
                          <Check className="w-5 h-5 md:w-7 md:h-7" />
                        ) : (
                          <step.icon className="w-5 h-5 md:w-7 md:h-7" />
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-[8px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-bold transition-colors duration-500",
                          isActive ? "text-brand-navy" : "text-brand-navy/20",
                          !isCurrent && "hidden md:block"
                        )}
                      >
                        {step.label}
                      </span>
                      {isCurrent && (
                        <motion.div
                          layoutId="stepper-glow"
                          className="absolute -inset-3 md:-inset-4 brand-gradient opacity-20 blur-xl md:blur-2xl rounded-full -z-10"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {currentStep === "upload" && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-sky/10 text-brand-navy text-[10px] font-bold uppercase tracking-widest mb-6 border border-brand-sky/20">
                    <Sparkles className="w-3 h-3 text-brand-sky" />
                    Estudio Gratuito en 2 Minutos
                  </div>

                  <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
                    Tu futuro energético <br />
                    <span className="brand-gradient-text">empieza aquí</span>
                  </h1>

                  <p className="text-brand-gray text-lg mb-16 max-w-2xl mx-auto leading-relaxed">
                    Sube tu última factura eléctrica y deja que nuestra inteligencia artificial
                    diseñe la solución de ahorro perfecta para tu hogar.
                  </p>

                  <FileUploader onFileSelect={handleFileSelect} />

                  <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                    {[
                      {
                        icon: ShieldCheck,
                        title: "100% Seguro",
                        desc: "Tus datos están protegidos por encriptación de grado bancario.",
                      },
                      {
                        icon: Zap,
                        title: "Ahorro Real",
                        desc: "Cálculos precisos basados en tu consumo histórico real.",
                      },
                      {
                        icon: Leaf,
                        title: "Sostenible",
                        desc: "Reduce tu huella de carbono con energía local certificada.",
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="p-6 rounded-3xl bg-white border border-brand-navy/5 shadow-sm hover:shadow-md transition-all"
                      >
                        <div className="w-10 h-10 rounded-xl bg-brand-navy/5 flex items-center justify-center mb-4 text-brand-navy">
                          <item.icon className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-brand-navy mb-2">{item.title}</h3>
                        <p className="text-brand-gray text-xs leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {currentStep === "validation" && (
                <motion.div
                  key="validation"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  className="max-w-3xl mx-auto"
                >
                  <div className="mb-12 text-center">
                    <h2 className="text-4xl font-bold mb-4">Verifica tu información</h2>
                    <p className="text-brand-gray">
                      Hemos analizado tu factura. Por favor, confirma que los datos extraídos son
                      correctos.
                    </p>

                    {rawExtraction?.extraction?.warnings?.length ? (
                      <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                        {rawExtraction.extraction.warnings[0]}
                      </div>
                    ) : null}
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-10 border border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
                    <form onSubmit={handleSubmit(onValidationSubmit)} className="space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Input
                          label="Nombre"
                          {...register("name")}
                          error={errors.name?.message}
                          placeholder="Ej. Juan"
                        />
                        <Input
                          label="Apellidos"
                          {...register("lastName")}
                          error={errors.lastName?.message}
                          placeholder="Ej. Pérez"
                        />
                        <Input
                          label="DNI / NIF"
                          {...register("dni")}
                          error={errors.dni?.message}
                          placeholder="12345678X"
                        />
                        <Input
                          label="IBAN"
                          {...register("iban")}
                          error={errors.iban?.message}
                          placeholder="ES15..."
                        />
                        <Input
                          label="CUPS"
                          {...register("cups")}
                          error={errors.cups?.message}
                          placeholder="ES00..."
                        />
                        <Input
                          label="Dirección"
                          className="md:col-span-2"
                          {...register("address")}
                          error={errors.address?.message}
                          placeholder="Calle, Número, Ciudad"
                        />
                        <Input
                          label="Email"
                          {...register("email")}
                          error={errors.email?.message}
                          placeholder="tu@email.com"
                        />
                        <Input
                          label="Teléfono"
                          {...register("phone")}
                          error={errors.phone?.message}
                          placeholder="600 000 000"
                        />
                        <Input
                          label="Consumo Mensual (kWh)"
                          type="number"
                          {...register("monthlyConsumption", { valueAsNumber: true })}
                          error={errors.monthlyConsumption?.message}
                        />
                      </div>

                      <div className="flex justify-center pt-8">
                        <Button type="submit" size="lg" className="w-full md:w-auto px-12 py-7 text-lg rounded-2xl">
                          Confirmar y Continuar <ArrowRight className="ml-3 w-5 h-5" />
                        </Button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              )}

              {currentStep === "map" && (
                <motion.div
                  key="map"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8"
                >
                  <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold mb-4">Selecciona tu comunidad</h2>
                    <p className="text-brand-gray">
                      Elige una de las instalaciones cercanas para calcular tu ahorro compartido.
                    </p>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-10 h-[700px]">
                    <div className="flex-1 bg-white rounded-[3rem] overflow-hidden relative border border-brand-navy/5 shadow-2xl shadow-brand-navy/5">
                      <div className="absolute inset-0 bg-brand-navy/[0.02]">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                          <div className="relative">
                            <div className="absolute -inset-20 brand-gradient opacity-10 blur-3xl rounded-full animate-pulse" />
                            <div className="relative w-16 h-16 brand-gradient rounded-full flex items-center justify-center shadow-2xl shadow-brand-mint/40">
                              <MapPin className="w-8 h-8 text-brand-navy" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="absolute bottom-8 left-8 right-8 glass-card p-6 rounded-3xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-brand-navy rounded-2xl flex items-center justify-center text-white">
                            <MapPin className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">
                              Tu Ubicación
                            </p>
                            <p className="font-bold text-brand-navy">
                              {extractedData?.address || "Cargando dirección..."}
                            </p>
                          </div>
                        </div>

                        <div className="hidden md:block px-4 py-2 bg-brand-mint/20 text-brand-navy text-[10px] font-bold rounded-full uppercase tracking-widest">
                          {installations.length} Instalaciones Disponibles
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:w-96 flex flex-col gap-6 overflow-y-auto pr-4 custom-scrollbar">
                      <h3 className="font-bold text-xl text-brand-navy flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-brand-mint" />
                        Plantas Recomendadas
                      </h3>

                      {isLoadingInstallations ? (
                        <div className="flex flex-col items-center justify-center py-12 text-brand-navy/40">
                          <Loader2 className="w-8 h-8 animate-spin mb-4" />
                          <p className="text-sm font-bold uppercase tracking-widest">
                            Buscando plantas...
                          </p>
                        </div>
                      ) : installations.length === 0 ? (
                        <div className="text-center py-12 text-brand-navy/40">
                          <p className="text-sm font-bold uppercase tracking-widest">
                            No hay plantas cercanas
                          </p>
                        </div>
                      ) : (
                        installations.map((inst, i) => (
                          <motion.div
                            key={inst.id || i}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            onClick={() => handleInstallationSelect(inst)}
                            className="p-8 rounded-[2rem] border border-brand-navy/5 bg-white hover:border-brand-mint hover:shadow-2xl hover:shadow-brand-mint/10 transition-all cursor-pointer group relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 w-32 h-32 brand-gradient opacity-0 group-hover:opacity-5 transition-opacity -mr-16 -mt-16 rounded-full" />

                            <div className="flex justify-between items-start gap-4 mb-4">
                              <p className="font-bold text-lg text-brand-navy group-hover:text-brand-mint transition-colors leading-tight">
                                {inst.nombre_instalacion}
                              </p>

                              <span className="text-[10px] font-bold text-brand-mint bg-brand-mint/10 px-2 py-1 rounded-lg uppercase">
                                {inst.modalidad}
                              </span>
                            </div>

                            <p className="text-xs font-semibold text-brand-gray flex items-center gap-2 mb-2">
                              <MapPin className="w-3 h-3" />
                              {inst.direccion}
                            </p>

                            <div className="grid grid-cols-2 gap-3 mt-6">
                              <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                                <p className="text-[10px] uppercase tracking-widest text-brand-navy/40 font-bold mb-1">
                                  Potencia
                                </p>
                                <p className="font-bold text-brand-navy">
                                  {formatNumber(inst.potencia_instalada_kwp)} kWp
                                </p>
                              </div>

                              <div className="rounded-2xl bg-brand-navy/[0.03] p-4">
                                <p className="text-[10px] uppercase tracking-widest text-brand-navy/40 font-bold mb-1">
                                  Autoconsumo
                                </p>
                                <p className="font-bold text-brand-navy">
                                  {displayPercentage(inst.porcentaje_autoconsumo)}%
                                </p>
                              </div>
                            </div>

                            <div className="mt-5 flex items-center gap-3 text-xs text-brand-gray">
                              <Building2 className="w-4 h-4" />
                              <span>{formatNumber(inst.horas_efectivas)} h efectivas</span>
                            </div>

                            <div className="mt-2 flex items-center gap-3 text-xs text-brand-gray">
                              <BatteryCharging className="w-4 h-4" />
                              <span>{formatNumber(inst.almacenamiento_kwh)} kWh almacenamiento</span>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {currentStep === "calculation" && (
                <motion.div
                  key="calculation"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-32 text-center"
                >
                  <div className="w-32 h-32 bg-white rounded-[2.5rem] shadow-2xl shadow-brand-navy/5 flex items-center justify-center mb-12 relative">
                    <Zap className="w-12 h-12 text-brand-navy animate-pulse" />
                    <div className="absolute -inset-4 border-4 border-brand-mint border-t-transparent rounded-[3rem] animate-spin" />
                  </div>

                  <h2 className="text-4xl font-bold mb-6">
                    Generando tu estudio <br />{" "}
                    <span className="brand-gradient-text">de alta precisión</span>
                  </h2>

                  <p className="text-brand-gray mb-12 max-w-sm mx-auto">
                    Nuestros algoritmos están procesando miles de variables para ofrecerte el mejor
                    resultado.
                  </p>

                  <div className="space-y-4 max-w-xs w-full">
                    {[
                      "Validando datos de factura",
                      "Analizando radiación solar local",
                      "Calculando retorno de inversión",
                    ].map((text, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.5 }}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-brand-navy/5 shadow-sm"
                      >
                        <div className="w-6 h-6 rounded-full brand-gradient flex items-center justify-center shrink-0">
                          <Check className="w-4 h-4 text-brand-navy" />
                        </div>
                        <span className="text-sm font-bold text-brand-navy/60">{text}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {currentStep === "result" && calculationResult && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-12"
                >
                  <div className="brand-gradient rounded-[2.5rem] md:rounded-[3.5rem] p-8 md:p-12 text-brand-navy shadow-2xl shadow-brand-mint/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 md:w-96 h-64 md:h-96 bg-white/10 blur-3xl rounded-full -mr-32 md:-mr-48 -mt-32 md:-mt-48" />

                    <div className="relative z-10">
                      <div className="flex flex-col lg:flex-row justify-between items-start gap-8 mb-12 md:mb-16">
                        <div>
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-brand-navy text-[10px] font-bold uppercase tracking-widest mb-4">
                            <Sparkles className="w-3 h-3" />
                            Estudio Finalizado
                          </div>

                          <h2 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">
                            Ahorra hasta <br className="hidden md:block" />{" "}
                            {formatCurrency(calculationResult.annualSavingsInvestment)} / año
                          </h2>

                          <p className="text-brand-navy/60 font-medium text-base md:text-lg">
                            Tu independencia energética comienza hoy mismo.
                          </p>
                        </div>

                        <div className="bg-white/30 backdrop-blur-xl p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/20 shadow-2xl text-center w-full lg:w-auto lg:min-w-[240px]">
                          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-navy/40 mb-2">
                            Ahorro a 25 años
                          </p>
                          <p className="text-3xl md:text-4xl font-bold">
                            {formatCurrency(calculationResult.annualSavingsInvestment * 25)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        {[
                          {
                            label: "Potencia Rec.",
                            value: `${calculationResult.recommendedPowerKwp} kWp`,
                          },
                          {
                            label: "Consumo Anual",
                            value: `${formatNumber(calculationResult.annualConsumptionKwh)} kWh`,
                          },
                          {
                            label: "Inversión",
                            value: formatCurrency(calculationResult.investmentCost),
                          },
                          { label: "Payback", value: "4.2 años" },
                        ].map((stat, i) => (
                          <div key={i} className="space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-navy/40">
                              {stat.label}
                            </p>
                            <p className="text-2xl font-bold">{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    <div className="lg:col-span-2 space-y-8">
                      <div className="bg-white rounded-[3rem] p-10 border border-brand-navy/5 shadow-xl shadow-brand-navy/5">
                        <h3 className="font-bold text-2xl text-brand-navy mb-8 flex items-center gap-3">
                          <TrendingUp className="w-6 h-6 text-brand-mint" />
                          Tu Propuesta de Valor
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {[
                            {
                              title: "Ahorro Inmediato",
                              desc: "Reduce tu factura hasta un 45% desde el primer día de conexión.",
                            },
                            {
                              title: "Energía Local",
                              desc: "Consume energía generada a menos de 2 km de tu vivienda.",
                            },
                            {
                              title: "Sin Obras",
                              desc: "No necesitas instalar paneles en tu tejado, nosotros nos encargamos.",
                            },
                            {
                              title: "Mantenimiento",
                              desc: "Monitorización 24/7 y mantenimiento preventivo incluido.",
                            },
                          ].map((item, i) => (
                            <div key={i} className="flex gap-4">
                              <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center shrink-0 shadow-md shadow-brand-mint/20">
                                <Check className="w-5 h-5 text-brand-navy" />
                              </div>
                              <div>
                                <h4 className="font-bold text-brand-navy mb-1">{item.title}</h4>
                                <p className="text-xs text-brand-gray leading-relaxed">
                                  {item.desc}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-brand-navy rounded-[3rem] p-10 text-white shadow-2xl shadow-brand-navy/20">
                        <h3 className="font-bold text-xl mb-8">Próximos Pasos</h3>

                        <div className="space-y-4">
                          <Button
                            className="w-full py-8 text-lg rounded-2xl brand-gradient text-brand-navy border-none"
                            onClick={handleDownloadPDF}
                          >
                            <Download className="mr-3 w-6 h-6" /> Descargar PDF
                          </Button>

                          <Button
                            className="w-full py-8 text-lg rounded-2xl bg-white/10 hover:bg-white/20 border-white/10 text-white"
                            variant="outline"
                            onClick={handleSendEmail}
                          >
                            <Mail className="mr-3 w-6 h-6" /> Enviar por Email
                          </Button>

                          <Button className="w-full py-8 text-lg rounded-2xl bg-brand-mint text-brand-navy hover:bg-brand-mint/90 border-none font-bold">
                            Hablar con Asesor
                          </Button>
                        </div>

                        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-white/40 mt-8">
                          Oferta válida por 7 días
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Layout>
  );
}