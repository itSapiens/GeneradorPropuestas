import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
// import dotenv from "dotenv";

import "dotenv/config";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { extractInvoiceWithFallback } from "./src/services/invoiceExtractionOrchestrator";
import { google } from "googleapis";
import { Readable } from "node:stream";
// dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";

const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "").replace(
  /\\n/g,
  "\n"
);

const GOOGLE_DRIVE_ROOT_FOLDER_ID =
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";

if (
  !GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !GOOGLE_PRIVATE_KEY ||
  !GOOGLE_DRIVE_ROOT_FOLDER_ID
) {
  throw new Error(
    "Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY o GOOGLE_DRIVE_ROOT_FOLDER_ID en .env"
  );
}

function normalizeDriveToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildClientFolderName(
  dni: string,
  nombre: string,
  apellidos: string
): string {
  return `${normalizeDriveToken(dni)}-${normalizeDriveToken(
    nombre
  )}_${normalizeDriveToken(apellidos)}`;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "si", "sí"].includes(value.toLowerCase());
  }
  return false;
}

function parseMaybeJson<T = any>(value: unknown): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getPeriodPrice(
  reqBody: any,
  invoiceData: any,
  period: "p1" | "p2" | "p3" | "p4" | "p5" | "p6"
): number | null {
  return (
    toNullableNumber(reqBody?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.prices?.[period]) ??
    toNullableNumber(invoiceData?.energy_prices?.[period]) ??
    toNullableNumber(invoiceData?.period_prices?.[period]) ??
    toNullableNumber(invoiceData?.coste_eur_kwh?.[period]) ??
    null
  );
}

async function ensureClientDriveFolder(params: {
  dni: string;
  nombre: string;
  apellidos: string;
}) {
  const folderName = buildClientFolderName(
    params.dni,
    params.nombre,
    params.apellidos
  );

  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `name='${escapeDriveQueryValue(folderName)}'`,
    `'${GOOGLE_DRIVE_ROOT_FOLDER_ID}' in parents`,
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    pageSize: 1,
    fields: "files(id,name,webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const found = existing.data.files?.[0];

  if (found?.id) {
    return {
      id: found.id,
      name: found.name ?? folderName,
      webViewLink:
        found.webViewLink ?? `https://drive.google.com/drive/folders/${found.id}`,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [GOOGLE_DRIVE_ROOT_FOLDER_ID],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error("No se pudo crear la carpeta del cliente en Drive");
  }

  return {
    id: created.data.id,
    name: created.data.name ?? folderName,
    webViewLink:
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

async function uploadBufferToDrive(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const uploaded = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.folderId],
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: "id,name,webViewLink,webContentLink",
    supportsAllDrives: true,
  });

  if (!uploaded.data.id) {
    throw new Error("No se pudo subir el archivo a Google Drive");
  }

  return {
    id: uploaded.data.id,
    name: uploaded.data.name ?? params.fileName,
    webViewLink:
      uploaded.data.webViewLink ??
      `https://drive.google.com/file/d/${uploaded.data.id}/view`,
    webContentLink: uploaded.data.webContentLink ?? null,
  };
}

const driveAuth = new google.auth.JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({
  version: "v3",
  auth: driveAuth,
});


function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  // app.use('/assets', express.static(path.join(__dirname, 'assets')));
  app.use("/assets", express.static(path.join(process.cwd(), "src", "assets")));


  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
  });

  // =========================
  // HEALTH
  // =========================

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // =========================
  // EXTRACTION API
  // =========================

  app.post("/api/extract-bill", upload.single("file"), async (req, res) => {
    try {
      const uploadedFile = req.file;

      if (!uploadedFile) {
        return res.status(400).json({
          error: "No se ha recibido ningún archivo",
        });
      }

      const allowedMimeTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];

      if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
        return res.status(400).json({
          error: "Tipo de archivo no soportado",
          details: `MIME recibido: ${uploadedFile.mimetype}`,
        });
      }

      const result = await extractInvoiceWithFallback({
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        fileName: uploadedFile.originalname,
      });

      return res.json(result);
    } catch (error: any) {
      console.error("Error en /api/extract-bill:", error);

      return res.status(500).json({
        error: "No se pudo extraer la información de la factura",
        details: error?.message || "Error desconocido",
      });
    }
  });

    app.post(
    "/api/confirm-study",
    upload.fields([
      { name: "invoice", maxCount: 1 },
      { name: "proposal", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const files = (req.files as {
          [fieldname: string]: Express.Multer.File[];
        }) || {};

        const invoiceFile = files.invoice?.[0] || files.file?.[0] || null;
        const proposalFile = files.proposal?.[0] || null;

        const customer = parseMaybeJson<any>(req.body.customer) ?? {};
        const location = parseMaybeJson<any>(req.body.location);
        const invoiceData = parseMaybeJson<any>(req.body.invoice_data) ?? {};
        const calculation = parseMaybeJson<any>(req.body.calculation);
        const selectedInstallationSnapshot = parseMaybeJson<any>(
          req.body.selected_installation_snapshot
        );
        const sourceFile = parseMaybeJson<any>(req.body.source_file);

        const nombre =
          pickFirstString(
            req.body.nombre,
            customer?.nombre,
            customer?.name,
            customer?.firstName
          ) ?? "";

        const apellidos =
          pickFirstString(
            req.body.apellidos,
            customer?.apellidos,
            customer?.lastName,
            customer?.surnames
          ) ?? "";

        const dni =
          pickFirstString(
            req.body.dni,
            customer?.dni,
            customer?.documentNumber,
            invoiceData?.dni,
            invoiceData?.nif
          ) ?? "";

        const cups = pickFirstString(
          req.body.cups,
          customer?.cups,
          invoiceData?.cups
        );

        const direccionCompleta = pickFirstString(
          req.body.direccion_completa,
          customer?.direccion_completa,
          customer?.address,
          invoiceData?.direccion_completa,
          invoiceData?.address,
          location?.address
        );

        const iban = pickFirstString(
          req.body.iban,
          customer?.iban,
          invoiceData?.iban
        );

        const tipoFacturaRaw = (
          pickFirstString(
            req.body.tipo_factura,
            customer?.tipo_factura,
            invoiceData?.tipo_factura,
            invoiceData?.billType,
            invoiceData?.tariffType
          ) || "2TD"
        ).toUpperCase();

        const tipo_factura = tipoFacturaRaw === "3TD" ? "3TD" : "2TD";

        if (!nombre || !apellidos || !dni) {
          return res.status(400).json({
            error: "Faltan nombre, apellidos o DNI para confirmar el estudio",
          });
        }

        const consumo_mensual_real_kwh =
          toNullableNumber(req.body.consumo_mensual_real_kwh) ??
          toNullableNumber(customer?.consumo_mensual_real_kwh) ??
          toNullableNumber(invoiceData?.consumo_mensual_real_kwh) ??
          toNullableNumber(invoiceData?.monthly_real_consumption_kwh) ??
          null;

        const consumo_medio_mensual_kwh =
          toNullableNumber(req.body.consumo_medio_mensual_kwh) ??
          toNullableNumber(customer?.consumo_medio_mensual_kwh) ??
          toNullableNumber(invoiceData?.consumo_medio_mensual_kwh) ??
          toNullableNumber(invoiceData?.monthly_average_consumption_kwh) ??
          null;

        const precio_p1_eur_kwh = getPeriodPrice(req.body, invoiceData, "p1");
        const precio_p2_eur_kwh = getPeriodPrice(req.body, invoiceData, "p2");
        const precio_p3_eur_kwh = getPeriodPrice(req.body, invoiceData, "p3");
        const precio_p4_eur_kwh = getPeriodPrice(req.body, invoiceData, "p4");
        const precio_p5_eur_kwh = getPeriodPrice(req.body, invoiceData, "p5");
        const precio_p6_eur_kwh = getPeriodPrice(req.body, invoiceData, "p6");

        const folder = await ensureClientDriveFolder({
          dni,
          nombre,
          apellidos,
        });

        let uploadedInvoice: {
          id: string;
          name: string;
          webViewLink: string;
          webContentLink: string | null;
        } | null = null;

        let uploadedProposal: {
          id: string;
          name: string;
          webViewLink: string;
          webContentLink: string | null;
        } | null = null;

        if (invoiceFile) {
          const extension =
            invoiceFile.originalname.split(".").pop()?.toLowerCase() || "pdf";

          uploadedInvoice = await uploadBufferToDrive({
            folderId: folder.id,
            fileName: `FACTURA_${normalizeDriveToken(dni)}.${extension}`,
            mimeType: invoiceFile.mimetype,
            buffer: invoiceFile.buffer,
          });
        }

        if (proposalFile) {
          uploadedProposal = await uploadBufferToDrive({
            folderId: folder.id,
            fileName: `PROPUESTA_${normalizeDriveToken(dni)}.pdf`,
            mimeType: proposalFile.mimetype || "application/pdf",
            buffer: proposalFile.buffer,
          });
        }

        const clientPayload = {
          nombre,
          apellidos,
          dni,
          cups: cups ?? null,
          direccion_completa: direccionCompleta ?? null,
          iban: iban ?? null,
          consumo_mensual_real_kwh,
          consumo_medio_mensual_kwh,
          precio_p1_eur_kwh,
          precio_p2_eur_kwh,
          precio_p3_eur_kwh,
          precio_p4_eur_kwh,
          precio_p5_eur_kwh,
          precio_p6_eur_kwh,
          tipo_factura,
          drive_folder_id: folder.id,
          drive_folder_url: folder.webViewLink,
          factura_drive_file_id: uploadedInvoice?.id ?? null,
          factura_drive_url: uploadedInvoice?.webViewLink ?? null,
          propuesta_drive_file_id: uploadedProposal?.id ?? null,
          propuesta_drive_url: uploadedProposal?.webViewLink ?? null,
        };

        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .upsert(clientPayload, { onConflict: "dni" })
          .select()
          .single();

        if (clientError) {
          console.error("Error guardando cliente:", clientError);
          return res.status(500).json({
            error: "Error saving client",
            details: clientError.message,
          });
        }

        const studyInsert = {
          language: req.body.language ?? "ES",
          consent_accepted: toBoolean(req.body.consent_accepted),
          source_file: {
            ...(sourceFile ?? {}),
            original_name: invoiceFile?.originalname ?? null,
            mime_type: invoiceFile?.mimetype ?? null,
            drive_folder_id: folder.id,
            drive_folder_url: folder.webViewLink,
            invoice_drive_file_id: uploadedInvoice?.id ?? null,
            invoice_drive_url: uploadedInvoice?.webViewLink ?? null,
            proposal_drive_file_id: uploadedProposal?.id ?? null,
            proposal_drive_url: uploadedProposal?.webViewLink ?? null,
          },
          customer:
            Object.keys(customer).length > 0
              ? customer
              : {
                  nombre,
                  apellidos,
                  dni,
                  cups,
                  direccion_completa: direccionCompleta,
                  iban,
                },
          location: location ?? null,
          invoice_data: invoiceData ?? null,
          selected_installation_id:
            req.body.selected_installation_id ?? null,
          selected_installation_snapshot:
            selectedInstallationSnapshot ?? null,
          calculation: calculation ?? null,
          status: req.body.status ?? "uploaded",
          email_status: req.body.email_status ?? "pending",
        };

        const { data: studyData, error: studyError } = await supabase
          .from("studies")
          .insert([studyInsert])
          .select()
          .single();

        if (studyError) {
          console.error("Error creando estudio confirmado:", studyError);
          return res.status(500).json({
            error: "Error saving confirmed study",
            details: studyError.message,
          });
        }

        return res.status(201).json({
          success: true,
          client: clientData,
          study: studyData,
          drive: {
            folderId: folder.id,
            folderUrl: folder.webViewLink,
            invoiceUrl: uploadedInvoice?.webViewLink ?? null,
            proposalUrl: uploadedProposal?.webViewLink ?? null,
          },
        });
      } catch (error: any) {
        console.error("Error en /api/confirm-study:", error);
        return res.status(500).json({
          error: "No se pudo confirmar el estudio",
          details: error?.message || "Error desconocido",
        });
      }
    }
  );

  // =========================
  // STUDIES API
  // =========================

  app.post("/api/studies", async (req, res) => {
    try {
      const payload = req.body;

      const { data, error } = await supabase
        .from("studies")
        .insert([
          {
            language: payload.language ?? "ES",
            consent_accepted: payload.consent_accepted ?? false,
            source_file: payload.source_file ?? null,
            customer: payload.customer ?? null,
            location: payload.location ?? null,
            invoice_data: payload.invoice_data ?? null,
            selected_installation_id: payload.selected_installation_id ?? null,
            selected_installation_snapshot:
              payload.selected_installation_snapshot ?? null,
            calculation: payload.calculation ?? null,
            status: payload.status ?? "uploaded",
            email_status: payload.email_status ?? "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creando estudio:", error);
        return res.status(500).json({
          error: "Error saving study",
          details: error.message,
        });
      }

      res.status(201).json(data);
    } catch (error: any) {
      console.error("Error inesperado creando estudio:", error);
      res.status(500).json({
        error: "Error saving study",
        details: error.message,
      });
    }
  });

  app.get("/api/studies", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error obteniendo estudios:", error);
        return res.status(500).json({
          error: "Error fetching studies",
          details: error.message,
        });
      }

      res.json(data ?? []);
    } catch (error: any) {
      console.error("Error inesperado obteniendo estudios:", error);
      res.status(500).json({
        error: "Error fetching studies",
        details: error.message,
      });
    }
  });

  app.get("/api/studies/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from("studies")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("Error obteniendo estudio:", error);
        return res.status(404).json({
          error: "Study not found",
          details: error.message,
        });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error inesperado obteniendo estudio:", error);
      res.status(500).json({
        error: "Error fetching study",
        details: error.message,
      });
    }
  });

  app.put("/api/studies/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;

      const { data, error } = await supabase
        .from("studies")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error actualizando estudio:", error);
        return res.status(500).json({
          error: "Error updating study",
          details: error.message,
        });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error inesperado actualizando estudio:", error);
      res.status(500).json({
        error: "Error updating study",
        details: error.message,
      });
    }
  });

  // =========================
  // INSTALLATIONS API
  // =========================

  app.get("/api/installations", async (req, res) => {
    try {
      const lat = req.query.lat ? Number(req.query.lat) : null;
      const lng = req.query.lng ? Number(req.query.lng) : null;
      const radius = req.query.radius ? Number(req.query.radius) : 2000;

      const { data, error } = await supabase
        .from("installations")
        .select("*")
        .eq("active", true)
        .order("nombre_instalacion", { ascending: true });

      if (error) {
        console.error("Error obteniendo instalaciones:", error);
        return res.status(500).json({
          error: "Error fetching installations",
          details: error.message,
        });
      }

      let installations = data ?? [];

      if (lat !== null && lng !== null) {
        installations = installations
          .map((installation) => {
            const distance_meters = haversineDistanceMeters(
              lat,
              lng,
              installation.lat,
              installation.lng
            );

            return {
              ...installation,
              distance_meters,
            };
          })
          .filter((installation) => installation.distance_meters <= radius)
          .sort((a, b) => a.distance_meters - b.distance_meters);
      }

      res.json(installations);
    } catch (error: any) {
      console.error("Error inesperado obteniendo instalaciones:", error);
      res.status(500).json({
        error: "Error fetching installations",
        details: error.message,
      });
    }
  });

  app.post("/api/installations", async (req, res) => {
    try {
      const payload = req.body;

      const { data, error } = await supabase
        .from("installations")
        .insert([
          {
            nombre_instalacion: payload.nombre_instalacion,
            direccion: payload.direccion,
            lat: payload.lat,
            lng: payload.lng,
            horas_efectivas: payload.horas_efectivas,
            potencia_instalada_kwp: payload.potencia_instalada_kwp,
            almacenamiento_kwh: payload.almacenamiento_kwh,
            coste_anual_mantenimiento_por_kwp:
              payload.coste_anual_mantenimiento_por_kwp,
            coste_kwh_inversion: payload.coste_kwh_inversion,
            coste_kwh_servicio: payload.coste_kwh_servicio,
            porcentaje_autoconsumo: payload.porcentaje_autoconsumo,
            modalidad: payload.modalidad,
            active: payload.active ?? true,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error creando instalación:", error);
        return res.status(500).json({
          error: "Error saving installation",
          details: error.message,
        });
      }

      res.status(201).json(data);
    } catch (error: any) {
      console.error("Error inesperado creando instalación:", error);
      res.status(500).json({
        error: "Error saving installation",
        details: error.message,
      });
    }
  });

  app.put("/api/installations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;

      const { data, error } = await supabase
        .from("installations")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error actualizando instalación:", error);
        return res.status(500).json({
          error: "Error updating installation",
          details: error.message,
        });
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error inesperado actualizando instalación:", error);
      res.status(500).json({
        error: "Error updating installation",
        details: error.message,
      });
    }
  });

  app.delete("/api/installations/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from("installations")
        .update({ active: false })
        .eq("id", id);

      if (error) {
        console.error("Error desactivando instalación:", error);
        return res.status(500).json({
          error: "Error deleting installation",
          details: error.message,
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error inesperado desactivando instalación:", error);
      res.status(500).json({
        error: "Error deleting installation",
        details: error.message,
      });
    }
  });

  // =========================
  // VITE
  // =========================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();