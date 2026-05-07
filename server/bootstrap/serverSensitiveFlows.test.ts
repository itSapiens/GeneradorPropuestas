import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import multer from "multer";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import { createContractController } from "../controllers/contractController";
import { createCoreController } from "../controllers/coreController";
import { createExtractionController } from "../controllers/extractionController";
import { createGeocodingController } from "../controllers/geocodingController";
import { createInstallationController } from "../controllers/installationController";
import { createStripeController } from "../controllers/stripeController";
import { createStudyController } from "../controllers/studyController";
import { registerContractsRoutes } from "../routes/contractsRoutes";
import { registerCoreRoutes } from "../routes/coreRoutes";
import { registerExtractionRoutes } from "../routes/extractionRoutes";
import { registerGeocodingRoutes } from "../routes/geocodingRoutes";
import { registerInstallationsRoutes } from "../routes/installationsRoutes";
import { registerStripeCheckoutRoutes } from "../routes/stripeCheckoutRoutes";
import { registerStripeWebhookRoute } from "../routes/stripeWebhookRoutes";
import { registerStudiesRoutes } from "../routes/studiesRoutes";

type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
  deps: ServerDependencies;
  state: ReturnType<typeof createInMemoryState>;
  spies: ReturnType<typeof createServiceSpies>;
};

function createInMemoryState() {
  return {
    accessTokens: [] as any[],
    checkoutSessions: new Map<string, any>(),
    clients: new Map<string, any>(),
    contracts: new Map<string, any>(),
    files: new Map<string, { buffer: Buffer; fileName: string; mimeType: string }>(),
    installations: new Map<string, any>(),
    reservations: new Map<string, any>(),
    studies: new Map<string, any>(),
  };
}

function createServiceSpies() {
  return {
    extractInvoiceWithFallback: vi.fn(),
    sendBankTransferReservationEmail: vi.fn(),
    sendProposalEmail: vi.fn(),
    sendReservationConfirmationAfterPayment: vi.fn(),
  };
}

function createServerDependenciesForTests() {
  const state = createInMemoryState();
  const spies = createServiceSpies();

  let studyCounter = 0;
  let clientCounter = 0;
  let contractCounter = 0;
  let reservationCounter = 0;
  let fileCounter = 0;
  let checkoutCounter = 0;

  const installationNear = {
    active: true,
    contractable_kwp_confirmed: 2,
    contractable_kwp_reserved: 1,
    contractable_kwp_total: 12,
    direccion: "Calle Mayor 1, Madrid",
    empresa: {
      cif: "B12345678",
      email: "madrid@sapiens.test",
      id: "empresa-madrid",
      nombre: "Sapiens Madrid Solar",
    },
    empresa_id: "empresa-madrid",
    horas_efectivas: 1600,
    iban_aportaciones: "ES1111111111111111111111",
    id: "installation-near",
    lat: 40.4169,
    lng: -3.7035,
    modalidad: "ambas",
    nombre_instalacion: "Madrid Centro",
    porcentaje_autoconsumo: 78,
    reserva_fija_eur: 650,
  };

  const installationFar = {
    active: true,
    contractable_kwp_confirmed: 0,
    contractable_kwp_reserved: 0,
    contractable_kwp_total: 25,
    direccion: "Avenida del Puerto 10, Valencia",
    empresa: {
      cif: "B87654321",
      email: "valencia@sapiens.test",
      id: "empresa-valencia",
      nombre: "Sapiens Valencia Solar",
    },
    empresa_id: "empresa-valencia",
    horas_efectivas: 1500,
    id: "installation-far",
    lat: 39.4699,
    lng: -0.3763,
    modalidad: "servicio",
    nombre_instalacion: "Valencia Puerto",
    porcentaje_autoconsumo: 72,
  };

  state.installations.set(installationNear.id, installationNear);
  state.installations.set(installationFar.id, installationFar);

  const deps: ServerDependencies = {
    env: {
      contractResumeJwtSecret: "test-secret",
      defaultSignalAmountEur: 500,
      frontendUrl: "http://frontend.local",
      gotenbergUrl: "http://gotenberg.test",
      installationSearchRadiusMeters: 5000,
      port: 0,
      sapiensBankAccountIban: "ES0000000000000000000000",
      sapiensContactEmail: "contacto@sapiens.test",
      sapiensContactPhone: "+34999999999",
      stripeWebhookSecret: "whsec_test",
    },
    repositories: {
      accessTokens: {
        async create(payload) {
          if (!payload.empresa_id) {
            throw new Error(
              "No se puede guardar el token de acceso sin empresa_id",
            );
          }

          state.accessTokens.push({ ...payload });
        },
        async findProposalContinueByHash(tokenHash) {
          return (
            [...state.accessTokens]
              .reverse()
              .find(
                (token) =>
                  token.token_hash === tokenHash &&
                  token.purpose === "proposal_continue" &&
                  !token.revoked_at,
              ) ?? null
          );
        },
        async revokeActiveProposalContinueTokens(payload) {
          const now = new Date().toISOString();
          state.accessTokens.forEach((token) => {
            if (
              token.client_id === payload.clientId &&
              token.study_id === payload.studyId &&
              token.purpose === "proposal_continue" &&
              !token.revoked_at
            ) {
              token.revoked_at = now;
            }
          });
        },
      },
      clients: {
        async findByDni(params) {
          return (
            [...state.clients.values()].find(
              (client) =>
                client.dni === params.dni &&
                client.empresa_id === params.empresaId,
            ) ?? null
          );
        },
        async findById(id) {
          return state.clients.get(id) ?? null;
        },
        async upsert(payload) {
          if (!payload.empresa_id) {
            throw new Error("No se puede guardar el cliente sin empresa_id");
          }

          if (!payload.dni) {
            throw new Error("No se puede guardar el cliente sin dni");
          }

          const existing =
            [...state.clients.values()].find(
              (client) =>
                client.dni === payload.dni &&
                client.empresa_id === payload.empresa_id,
            ) ??
            null;

          if (existing) {
            const updated = { ...existing, ...payload };
            state.clients.set(existing.id, updated);
            return updated;
          }

          const created = {
            id: `client-${++clientCounter}`,
            ...payload,
          };
          state.clients.set(created.id, created);
          return created;
        },
      },
      contracts: {
        async create(payload) {
          if (!payload.empresa_id) {
            throw new Error("No se puede guardar el contrato sin empresa_id");
          }

          const created = {
            confirmed_at: null,
            contract_drive_file_id: null,
            contract_drive_url: null,
            created_at: new Date().toISOString(),
            drive_folder_id: null,
            drive_folder_url: null,
            id: `contract-${++contractCounter}`,
            metadata: {},
            signed_at: null,
            uploaded_at: null,
            ...payload,
          };
          state.contracts.set(created.id, created);
          return created;
        },
        async findById(id) {
          return state.contracts.get(id) ?? null;
        },
        async findByStudyId(studyId) {
          return (
            [...state.contracts.values()].find((contract) => contract.study_id === studyId) ??
            null
          );
        },
        async update(id, payload) {
          const current = state.contracts.get(id);
          const updated = {
            ...current,
            ...payload,
            metadata: {
              ...(current?.metadata ?? {}),
              ...(payload.metadata ?? {}),
            },
          };
          state.contracts.set(id, updated);
          return updated;
        },
      },
      installations: {
        async findActive() {
          return [...state.installations.values()].filter(
            (installation) => installation.active,
          );
        },
        async findById(id) {
          return state.installations.get(id) ?? null;
        },
      },
      reservations: {
        async confirmPayment(payload) {
          const current = state.reservations.get(payload.reservationId);
          if (!current) return;
          state.reservations.set(payload.reservationId, {
            ...current,
            confirmed_at: new Date().toISOString(),
            payment_status: "paid",
            reservation_status: "confirmed",
            stripe_checkout_session_id: payload.stripeCheckoutSessionId,
            stripe_payment_intent_id: payload.stripePaymentIntentId ?? null,
          });
        },
        async createPendingReservation(payload) {
          const created = {
            client_id: payload.clientId,
            confirmed_at: null,
            contract_id: payload.contractId,
            currency: null,
            id: `reservation-${++reservationCounter}`,
            installation_id: payload.installationId,
            metadata: {},
            notes: payload.notes,
            payment_deadline_at: payload.paymentDeadlineAt,
            payment_status: "pending",
            released_at: null,
            reserved_kwp: payload.reservedKwp,
            reservation_status: "pending_payment",
            signal_amount: null,
            study_id: payload.studyId,
            stripe_checkout_session_id: null,
            ...payload,
          };
          state.reservations.set(created.id, created);
          return created;
        },
        async findByContractId(contractId) {
          return (
            [...state.reservations.values()].find(
              (reservation) => reservation.contract_id === contractId,
            ) ?? null
          );
        },
        async findById(id) {
          return state.reservations.get(id) ?? null;
        },
        async releaseReservation(payload) {
          const current = state.reservations.get(payload.reservationId);
          if (!current) return;
          state.reservations.set(payload.reservationId, {
            ...current,
            payment_status: payload.paymentStatus,
            reason: payload.reason,
            released_at: new Date().toISOString(),
            reservation_status: "released",
          });
        },
        async update(id, payload) {
          const current = state.reservations.get(id);
          state.reservations.set(id, {
            ...current,
            ...payload,
            metadata: {
              ...(current?.metadata ?? {}),
              ...(payload.metadata ?? {}),
            },
          });
        },
      },
      studies: {
        async create(payload) {
          const created = {
            created_at: new Date().toISOString(),
            id: `study-${++studyCounter}`,
            ...payload,
          };
          state.studies.set(created.id, created);
          return created;
        },
        async findById(id) {
          return state.studies.get(id) ?? null;
        },
        async update(id, payload) {
          const current = state.studies.get(id);
          const updated = { ...current, ...payload };
          state.studies.set(id, updated);
          return updated;
        },
      },
    },
    services: {
      documents: {
        async downloadFileAsBuffer(payload) {
          const file = state.files.get(payload.path);
          if (!file) {
            throw new Error(`Supabase file not found: ${payload.path}`);
          }

          return {
            buffer: file.buffer,
            fileName: file.fileName,
            mimeType: file.mimeType,
          };
        },
        async uploadClientDocument(payload) {
          const folderPath = `clients/${payload.nombre.toLowerCase()}-${payload.apellidos.toLowerCase()}-${payload.dni.toLowerCase()}`
            .replace(/[^a-z0-9/]+/g, "-")
            .replace(/-+/g, "-");
          const path = `${folderPath}/${payload.fileName}`;
          state.files.set(path, {
            buffer: payload.buffer,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
          });

          return {
            bucket: "generador-propuestas-documentos",
            fileName: payload.fileName,
            folderPath,
            mimeType: payload.mimeType,
            path,
          };
        },
      },
      drive: {
        async downloadFileAsBuffer(fileId) {
          const file = state.files.get(fileId);
          if (!file) {
            throw new Error(`Drive file not found: ${fileId}`);
          }

          return {
            buffer: file.buffer,
            fileName: file.fileName,
            mimeType: file.mimeType,
          };
        },
        async ensureClientFolder(payload) {
          return {
            id: `client-folder-${payload.dni}`,
            name: `${payload.dni}-${payload.nombre}-${payload.apellidos}`,
            webViewLink: `https://drive.test/client/${payload.dni}`,
          };
        },
        async ensureContractsStatusFolder() {
          return {
            folder: {
              id: "contracts-pending",
              name: "PendientesPago",
              webViewLink: "https://drive.test/contracts/pending",
            },
            root: {
              id: "contracts-root",
              name: "Contratos",
              webViewLink: "https://drive.test/contracts",
            },
          };
        },
        async uploadBuffer(payload) {
          const fileId = `file-${++fileCounter}`;
          state.files.set(fileId, {
            buffer: payload.buffer,
            fileName: payload.fileName,
            mimeType: payload.mimeType,
          });

          return {
            id: fileId,
            name: payload.fileName,
            webContentLink: `https://drive.test/content/${fileId}`,
            webViewLink: `https://drive.test/view/${fileId}`,
          };
        },
      },
      extraction: {
        extractInvoiceWithFallback: spies.extractInvoiceWithFallback.mockResolvedValue({
          cups: "ES0031400000000001AA",
          monthly_average_consumption_kwh: 320,
          nif: "12345678Z",
          tipo_factura: "2TD",
        }),
      },
      geocoding: {
        async geocodeAddress(address) {
          if (!String(address).trim()) {
            return null;
          }

          if (/sin resultado/i.test(address)) {
            return null;
          }

          return {
            formattedAddress: "Gran Via 1, Madrid, Spain",
            lat: 40.4168,
            lng: -3.7038,
            placeId: "place-madrid-center",
          };
        },
        getGeocodeErrorResponse() {
          return null;
        },
        isGeocodeError() {
          return false;
        },
      },
      mail: {
        sendBankTransferReservationEmail:
          spies.sendBankTransferReservationEmail.mockResolvedValue(undefined),
        sendProposalEmail: spies.sendProposalEmail.mockResolvedValue(undefined),
        sendReservationConfirmationAfterPayment:
          spies.sendReservationConfirmationAfterPayment.mockResolvedValue(undefined),
      },
      pdf: {
        async convertHtmlToPdf(payload) {
          return Buffer.from(payload.html);
        },
      },
      stripe: {
        constructWebhookEvent(payload) {
          const event = JSON.parse(payload.rawBody.toString("utf8"));
          const sessionId = event?.data?.object?.id;
          const existing = sessionId ? state.checkoutSessions.get(sessionId) : null;

          if (existing && event?.data?.object) {
            state.checkoutSessions.set(sessionId, {
              ...existing,
              ...event.data.object,
            });
          }

          return event;
        },
        async createCheckoutSessionForReservation(payload) {
          const id = `cs_test_${++checkoutCounter}`;
          const session = {
            client_reference_id: payload.reservationId,
            customer_email: payload.clientEmail ?? null,
            id,
            metadata: {
              contractId: payload.contractId,
              reservationId: payload.reservationId,
            },
            payment_status: "unpaid",
            status: "open",
            url: `https://stripe.test/checkout/${id}`,
          };

          state.checkoutSessions.set(id, session);
          return session;
        },
        async retrieveCheckoutSession(sessionId) {
          const session = state.checkoutSessions.get(sessionId);

          if (!session) {
            throw new Error(`Stripe session not found: ${sessionId}`);
          }

          return session;
        },
      },
    },
  };

  return { deps, spies, state };
}

async function startTestServer(): Promise<TestServer> {
  const { deps, spies, state } = createServerDependenciesForTests();
  const app = express();
  const upload = multer({
    limits: { fileSize: 15 * 1024 * 1024 },
    storage: multer.memoryStorage(),
  });

  registerStripeWebhookRoute(app, createStripeController(deps));
  app.use(express.json({ limit: "10mb" }));

  registerCoreRoutes(app, createCoreController());
  registerExtractionRoutes(app, upload, createExtractionController(deps));
  registerStudiesRoutes(app, upload, createStudyController(deps));
  registerContractsRoutes(app, upload, createContractController(deps));
  registerGeocodingRoutes(app, createGeocodingController(deps));
  registerStripeCheckoutRoutes(app, createStripeController(deps));
  registerInstallationsRoutes(app, createInstallationController(deps));

  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    deps,
    spies,
    state,
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
}

async function postJson(baseUrl: string, path: string, payload?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    body: payload === undefined ? undefined : JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function buildPdfFile(name: string) {
  return new File([new Blob(["%PDF-1.4 test file"])], name, {
    type: "application/pdf",
  });
}

function extractTokenFromContinueUrl(continueUrl: string) {
  const url = new URL(continueUrl);
  return url.searchParams.get("token") ?? "";
}

async function createStudyAndGeneratedContract(
  baseUrl: string,
  options?: {
    cups?: string;
  },
) {
  const confirmForm = new FormData();
  confirmForm.append("customer", JSON.stringify({
    apellidos: "López",
    dni: "12345678Z",
    email: "cliente@sapiens.test",
    nombre: "Ana",
    telefono: "600123123",
  }));
  confirmForm.append("location", JSON.stringify({
    address: "Gran Via 1, Madrid",
  }));
  confirmForm.append("calculation", JSON.stringify({
    recommendedPowerKwp: 3.2,
  }));
  confirmForm.append("invoice_data", JSON.stringify({
    cups: options?.cups ?? "ES0031400000000001AA",
    tipo_factura: "2TD",
  }));
  confirmForm.append("selected_installation_id", "installation-near");
  confirmForm.append("invoice", buildPdfFile("factura.pdf"));
  confirmForm.append("proposal", buildPdfFile("propuesta.pdf"));

  const confirmResponse = await fetch(`${baseUrl}/api/confirm-study`, {
    body: confirmForm,
    method: "POST",
  });
  const confirm = await readJsonResponse(confirmResponse);

  expect(confirm.status).toBe(201);
  expect(confirm.body.success).toBe(true);

  const studyId = confirm.body.study.id as string;

  const autoAssignResponse = await postJson(
    baseUrl,
    `/api/studies/${studyId}/auto-assign-installation`,
    { assignedKwp: 3.2 },
  );
  const autoAssign = await readJsonResponse(autoAssignResponse);

  expect(autoAssign.status).toBe(200);
  expect(autoAssign.body.success).toBe(true);
  expect(autoAssign.body.installation.id).toBe("installation-near");

  const generateResponse = await postJson(
    baseUrl,
    `/api/contracts/generate-from-study/${studyId}`,
    { proposalMode: "investment" },
  );
  const generated = await readJsonResponse(generateResponse);

  expect(generated.status).toBe(200);
  expect(generated.body.success).toBe(true);
  expect(generated.body.preview.contractId).toBe(generated.body.contract.id);
  expect(generated.body.preview.installation.empresa.nombre).toBe(
    "Sapiens Madrid Solar",
  );
  expect(generated.body.preview.installation.empresa.cif).toBe("B12345678");
  expect(generated.body.previewHtml).toContain("Empresa");
  expect(generated.body.previewHtml).toContain("Sapiens Madrid Solar");
  expect(generated.body.previewHtml).toContain("B12345678");

  return {
    confirm: confirm.body,
    generated: generated.body,
    studyId,
  };
}

describe("server sensitive frontend flows", () => {
  let testServer: TestServer | null = null;
  let originalMapsKey = "";

  beforeEach(() => {
    originalMapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || "";
    process.env.VITE_GOOGLE_MAPS_API_KEY = "maps-test-key";
  });

  afterEach(async () => {
    process.env.VITE_GOOGLE_MAPS_API_KEY = originalMapsKey;

    if (testServer) {
      await testServer.close();
      testServer = null;
    }
  });

  it("keeps the discovery and study-confirmation flow compatible with the frontend", async () => {
    testServer = await startTestServer();

    const configResponse = await fetch(`${testServer.baseUrl}/api/config`);
    const config = await readJsonResponse(configResponse);
    expect(config.status).toBe(200);
    expect(config.body.googleMapsApiKey).toBe("maps-test-key");

    const extractionForm = new FormData();
    extractionForm.append("file", buildPdfFile("factura.pdf"));

    const extractionResponse = await fetch(
      `${testServer.baseUrl}/api/extract-bill`,
      {
        body: extractionForm,
        method: "POST",
      },
    );
    const extraction = await readJsonResponse(extractionResponse);
    expect(extraction.status).toBe(200);
    expect(extraction.body.cups).toBe("ES0031400000000001AA");

    const geocodeResponse = await postJson(
      testServer.baseUrl,
      "/api/geocode-address",
      { address: "Gran Via 1, Madrid" },
    );
    const geocode = await readJsonResponse(geocodeResponse);
    expect(geocode.status).toBe(200);
    expect(geocode.body.success).toBe(true);
    expect(geocode.body.coords.lat).toBeCloseTo(40.4168, 4);

    const installationsResponse = await fetch(
      `${testServer.baseUrl}/api/installations?lat=40.4168&lng=-3.7038&radius=5000`,
    );
    const installations = await readJsonResponse(installationsResponse);
    expect(installations.status).toBe(200);
    expect(installations.body).toHaveLength(1);
    expect(installations.body[0].id).toBe("installation-near");
    expect(installations.body[0].available_kwp).toBe(9);

    const { confirm, studyId } = await createStudyAndGeneratedContract(
      testServer.baseUrl,
    );

    expect(confirm.study.id).toBe(studyId);
    expect(confirm.email.status).toBe("sent");
    expect(confirm.client.empresa_id).toBe("empresa-madrid");
    expect(confirm.study.selected_installation_id).toBe("installation-near");
    expect(confirm.email.continueContractUrl).toContain(
      "/continuar-contratacion?token=",
    );
    expect(testServer.state.accessTokens).toHaveLength(1);
    expect(testServer.state.accessTokens[0]?.empresa_id).toBe("empresa-madrid");
    expect(testServer.spies.sendProposalEmail).toHaveBeenCalledOnce();
  });

  it("normalizes spaced CUPS before saving the client", async () => {
    testServer = await startTestServer();

    const { confirm } = await createStudyAndGeneratedContract(
      testServer.baseUrl,
      {
        cups: "ES 0031 4000 0000 0001 AA",
      },
    );

    expect(confirm.client.cups).toBe("ES0031400000000001AA");
    expect(confirm.study.customer.cups).toBe("ES0031400000000001AA");
  });

  it("allows the same DNI in different companies when the installation changes", async () => {
    testServer = await startTestServer();

    const buildConfirmForm = (installationId: string) => {
      const form = new FormData();
      form.append("customer", JSON.stringify({
        apellidos: "López",
        dni: "12345678Z",
        email: "cliente@sapiens.test",
        nombre: "Ana",
      }));
      form.append("location", JSON.stringify({
        address: "Gran Via 1, Madrid",
      }));
      form.append("calculation", JSON.stringify({
        recommendedPowerKwp: 3.2,
      }));
      form.append("selected_installation_id", installationId);
      form.append("proposal", buildPdfFile("propuesta.pdf"));
      return form;
    };

    const madridResponse = await fetch(`${testServer.baseUrl}/api/confirm-study`, {
      body: buildConfirmForm("installation-near"),
      method: "POST",
    });
    const madrid = await readJsonResponse(madridResponse);

    const valenciaResponse = await fetch(`${testServer.baseUrl}/api/confirm-study`, {
      body: buildConfirmForm("installation-far"),
      method: "POST",
    });
    const valencia = await readJsonResponse(valenciaResponse);

    expect(madridResponse.status).toBe(201);
    expect(valenciaResponse.status).toBe(201);
    expect(madrid.body.client.empresa_id).toBe("empresa-madrid");
    expect(valencia.body.client.empresa_id).toBe("empresa-valencia");
    expect(testServer.state.clients.size).toBe(2);
  });

  it("keeps the proposal access, contract generation, signature and bank transfer flow working", async () => {
    testServer = await startTestServer();

    const { confirm, generated } = await createStudyAndGeneratedContract(
      testServer.baseUrl,
    );
    const continueToken = extractTokenFromContinueUrl(
      confirm.email.continueContractUrl,
    );

    const previewResponse = await fetch(
      `${testServer.baseUrl}/api/contracts/proposal-access/preview?token=${encodeURIComponent(continueToken)}`,
    );
    const preview = await readJsonResponse(previewResponse);
    expect(preview.status).toBe(200);
    expect(preview.body.success).toBe(true);
    expect(preview.body.installation.availableProposalModes).toContain(
      "investment",
    );

    const validateResponse = await postJson(
      testServer.baseUrl,
      "/api/contracts/proposal-access/validate",
      {
        apellidos: "López",
        dni: "12345678Z",
        nombre: "Ana",
        token: continueToken,
      },
    );
    const validate = await readJsonResponse(validateResponse);
    expect(validate.status).toBe(200);
    expect(validate.body.success).toBe(true);
    expect(validate.body.resumeToken).toBeTruthy();

    const generateFromAccessResponse = await postJson(
      testServer.baseUrl,
      "/api/contracts/generate-from-access",
      {
        proposalMode: "investment",
        resumeToken: validate.body.resumeToken,
      },
    );
    const generateFromAccess = await readJsonResponse(generateFromAccessResponse);
    expect(generateFromAccess.status).toBe(200);
    expect(generateFromAccess.body.success).toBe(true);
    expect(generateFromAccess.body.contract.id).toBe(generated.contract.id);
    expect(generateFromAccess.body.contract.empresa_id).toBe("empresa-madrid");

    const signForm = new FormData();
    signForm.append("signed_contract", buildPdfFile("contrato-firmado.pdf"));

    const signResponse = await fetch(
      `${testServer.baseUrl}/api/contracts/${generated.contract.id}/sign`,
      {
        body: signForm,
        method: "POST",
      },
    );
    const signed = await readJsonResponse(signResponse);
    expect(signResponse.status).toBe(201);
    expect(signed.body.success).toBe(true);
    expect(signed.body.nextStep).toBe("pending_bank_transfer");
    expect(signed.body.contract.status).toBe("signed");
    expect(signed.body.bankTransfer.emailSentTo).toBe("cliente@sapiens.test");
    expect(testServer.spies.sendBankTransferReservationEmail).toHaveBeenCalledOnce();

    const previewAfterSignResponse = await fetch(
      `${testServer.baseUrl}/api/contracts/proposal-access/preview?token=${encodeURIComponent(continueToken)}`,
    );
    const previewAfterSign = await readJsonResponse(previewAfterSignResponse);
    expect(previewAfterSignResponse.status).toBe(200);
    expect(previewAfterSign.body.existingContract.id).toBe(generated.contract.id);
    expect(previewAfterSign.body.existingReservation.id).toBe(
      signed.body.reservation.id,
    );

    const generateAfterSignResponse = await postJson(
      testServer.baseUrl,
      "/api/contracts/generate-from-access",
      {
        proposalMode: "investment",
        resumeToken: validate.body.resumeToken,
      },
    );
    const generateAfterSign = await readJsonResponse(generateAfterSignResponse);
    expect(generateAfterSignResponse.status).toBe(200);
    expect(generateAfterSign.body.alreadySigned).toBe(true);
    expect(generateAfterSign.body.contract.id).toBe(generated.contract.id);
    expect(generateAfterSign.body.nextStep).toBe("pending_bank_transfer");

    const bankTransferResponse = await postJson(
      testServer.baseUrl,
      `/api/contracts/${generated.contract.id}/payments/bank-transfer`,
    );
    const bankTransfer = await readJsonResponse(bankTransferResponse);

    expect(bankTransfer.status).toBe(200);
    expect(bankTransfer.body.success).toBe(true);
    expect(bankTransfer.body.bankTransfer.emailSentTo).toBe(
      "cliente@sapiens.test",
    );
    expect(bankTransfer.body.bankTransfer.iban).toBe(
      "ES1111111111111111111111",
    );
    expect(bankTransfer.body.bankTransfer.beneficiary).toBe(
      "Sapiens Madrid Solar",
    );
    expect(bankTransfer.body.bankTransfer.supportEmail).toBe(
      "madrid@sapiens.test",
    );
    expect(bankTransfer.body.bankTransfer.concept).toMatch(
      /^Ana López - CT-/,
    );
    expect(testServer.spies.sendBankTransferReservationEmail).toHaveBeenCalledOnce();
    expect(
      testServer.spies.sendBankTransferReservationEmail.mock.calls[0][0]
        .bankBeneficiary,
    ).toBe("Sapiens Madrid Solar");
    expect(
      testServer.spies.sendBankTransferReservationEmail.mock.calls[0][0]
        .bankSupportEmail,
    ).toBe("madrid@sapiens.test");
    expect(
      testServer.spies.sendBankTransferReservationEmail.mock.calls[0][0]
        .transferConcept,
    ).toBe(bankTransfer.body.bankTransfer.concept);
  });

  it("recovers an already signed contract that never selected a payment method", async () => {
    testServer = await startTestServer();

    const { confirm, generated } = await createStudyAndGeneratedContract(
      testServer.baseUrl,
    );
    const continueToken = extractTokenFromContinueUrl(
      confirm.email.continueContractUrl,
    );
    const legacyContractPdfPath = "legacy/contracts/contrato-firmado.pdf";

    testServer.state.files.set(legacyContractPdfPath, {
      buffer: Buffer.from("%PDF-1.4 legacy signed contract"),
      fileName: "contrato-firmado.pdf",
      mimeType: "application/pdf",
    });

    const originalContract = testServer.state.contracts.get(
      generated.contract.id,
    );
    testServer.state.contracts.set(generated.contract.id, {
      ...originalContract,
      contract_supabase_bucket: "generador-propuestas-documentos",
      contract_supabase_path: legacyContractPdfPath,
      metadata: {
        ...(originalContract?.metadata ?? {}),
        payment_method: null,
        payment_method_selected_at: null,
        payment_step: "pending_method_selection",
      },
      signed_at: new Date().toISOString(),
      status: "signed",
      uploaded_at: new Date().toISOString(),
    });

    const validateResponse = await postJson(
      testServer.baseUrl,
      "/api/contracts/proposal-access/validate",
      {
        apellidos: "López",
        dni: "12345678Z",
        nombre: "Ana",
        token: continueToken,
      },
    );
    const validate = await readJsonResponse(validateResponse);
    expect(validate.status).toBe(200);

    const recoverResponse = await postJson(
      testServer.baseUrl,
      "/api/contracts/generate-from-access",
      {
        proposalMode: "investment",
        resumeToken: validate.body.resumeToken,
      },
    );
    const recovered = await readJsonResponse(recoverResponse);

    expect(recoverResponse.status).toBe(200);
    expect(recovered.body.alreadySigned).toBe(true);
    expect(recovered.body.nextStep).toBe("pending_bank_transfer");
    expect(recovered.body.bankTransfer.emailSentTo).toBe(
      "cliente@sapiens.test",
    );
    expect(recovered.body.bankTransfer.concept).toMatch(/^Ana López - CT-/);
    expect(recovered.body.reservation.paymentMethod).toBe("bank_transfer");
    expect(recovered.body.reservation.paymentStatus).toBe("pending");
    expect(testServer.state.reservations.size).toBe(1);
    expect(testServer.spies.sendBankTransferReservationEmail).toHaveBeenCalledOnce();

    const recoveredReservation = [...testServer.state.reservations.values()][0];
    expect(recoveredReservation.contract_id).toBe(generated.contract.id);
    expect(recoveredReservation.metadata.payment_method).toBe("bank_transfer");
    expect(
      recoveredReservation.metadata.payment_instructions_sent_count,
    ).toBe(1);

    const recoveredContract = testServer.state.contracts.get(
      generated.contract.id,
    );
    expect(recoveredContract?.metadata.payment_method).toBe("bank_transfer");
    expect(recoveredContract?.metadata.payment_flow_status).toBe(
      "pending_payment",
    );
  });

  it("keeps the stripe payment, status polling, webhook and retry flow working", async () => {
    testServer = await startTestServer();

    const { generated } = await createStudyAndGeneratedContract(testServer.baseUrl);

    const signForm = new FormData();
    signForm.append("signed_contract", buildPdfFile("contrato-firmado.pdf"));

    const signResponse = await fetch(
      `${testServer.baseUrl}/api/contracts/${generated.contract.id}/sign`,
      {
        body: signForm,
        method: "POST",
      },
    );
    const signed = await readJsonResponse(signResponse);
    expect(signResponse.status).toBe(201);

    const stripePaymentResponse = await postJson(
      testServer.baseUrl,
      `/api/contracts/${generated.contract.id}/payments/stripe`,
    );
    const stripePayment = await readJsonResponse(stripePaymentResponse);
    expect(stripePayment.status).toBe(200);
    expect(stripePayment.body.success).toBe(true);
    expect(stripePayment.body.stripe.checkoutUrl).toContain("stripe.test");

    const pendingStatusResponse = await fetch(
      `${testServer.baseUrl}/api/stripe/checkout-session-status?session_id=${encodeURIComponent(
        stripePayment.body.stripe.checkoutSessionId,
      )}&contractId=${encodeURIComponent(generated.contract.id)}`,
    );
    const pendingStatus = await readJsonResponse(pendingStatusResponse);
    expect(pendingStatus.status).toBe(200);
    expect(pendingStatus.body.waitingWebhook).toBe(false);
    expect(pendingStatus.body.session.status).toBe("open");

    const retryResponse = await postJson(
      testServer.baseUrl,
      `/api/contracts/${generated.contract.id}/retry-payment`,
    );
    const retried = await readJsonResponse(retryResponse);
    expect(retryResponse.status).toBe(200);
    expect(retried.body.success).toBe(true);
    expect(retried.body.stripe.checkoutSessionId).not.toBe(
      stripePayment.body.stripe.checkoutSessionId,
    );

    const webhookPayload = {
      data: {
        object: {
          client_reference_id: signed.body.reservation.id,
          customer_email: "cliente@sapiens.test",
          id: retried.body.stripe.checkoutSessionId,
          metadata: {
            contractId: generated.contract.id,
            reservationId: signed.body.reservation.id,
          },
          payment_intent: "pi_test_123",
          payment_status: "paid",
          status: "complete",
        },
      },
      type: "checkout.session.completed",
    };

    const webhookResponse = await fetch(
      `${testServer.baseUrl}/api/stripe/webhook`,
      {
        body: JSON.stringify(webhookPayload),
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "sig_test",
        },
        method: "POST",
      },
    );
    const webhook = await readJsonResponse(webhookResponse);
    expect(webhookResponse.status).toBe(200);
    expect(webhook.body.received).toBe(true);

    const paidStatusResponse = await fetch(
      `${testServer.baseUrl}/api/stripe/checkout-session-status?session_id=${encodeURIComponent(
        retried.body.stripe.checkoutSessionId,
      )}&contractId=${encodeURIComponent(generated.contract.id)}`,
    );
    const paidStatus = await readJsonResponse(paidStatusResponse);
    expect(paidStatus.status).toBe(200);
    expect(paidStatus.body.waitingWebhook).toBe(false);
    expect(paidStatus.body.reservation.paymentStatus).toBe("paid");
    expect(paidStatus.body.reservation.reservationStatus).toBe("confirmed");
    expect(testServer.spies.sendReservationConfirmationAfterPayment).toHaveBeenCalledOnce();
  });
});
