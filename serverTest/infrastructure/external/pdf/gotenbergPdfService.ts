const DEFAULT_GOTENBERG_TIMEOUT_MS = 30_000;
const METADATA_IDENTITY_ENDPOINT =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function getAudience(url: string) {
  const parsedUrl = new URL(url);
  return `${parsedUrl.protocol}//${parsedUrl.host}`;
}

function shouldUseCloudRunAuth(url: string) {
  const mode = process.env.GOTENBERG_AUTH_MODE?.toLowerCase();

  if (mode === "none") {
    return false;
  }

  if (mode === "google-id-token") {
    return true;
  }

  try {
    return new URL(url).hostname.endsWith(".run.app");
  } catch {
    return false;
  }
}

async function getCloudRunIdentityToken(audience: string, signal: AbortSignal) {
  const tokenUrl = new URL(METADATA_IDENTITY_ENDPOINT);
  tokenUrl.searchParams.set("audience", audience);
  tokenUrl.searchParams.set("format", "full");

  const response = await fetch(tokenUrl, {
    headers: {
      "Metadata-Flavor": "Google",
    },
    signal,
  });

  if (!response.ok) {
    const details = await readErrorBody(response);
    throw new Error(
      `No se pudo obtener el token de identidad para Gotenberg (${response.status})${
        details ? `: ${details.slice(0, 500)}` : ""
      }`,
    );
  }

  return response.text();
}

async function buildGotenbergHeaders(url: string, signal: AbortSignal) {
  if (!shouldUseCloudRunAuth(url)) {
    return undefined;
  }

  const token = await getCloudRunIdentityToken(getAudience(url), signal);

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function readErrorBody(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function convertHtmlToPdfWithGotenberg(payload: {
  gotenbergUrl: string;
  html: string;
  timeoutMs?: number;
}): Promise<Buffer> {
  const gotenbergUrl = normalizeBaseUrl(payload.gotenbergUrl);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    payload.timeoutMs ?? DEFAULT_GOTENBERG_TIMEOUT_MS,
  );

  try {
    const headers = await buildGotenbergHeaders(gotenbergUrl, controller.signal);
    const formData = new FormData();
    formData.append(
      "files",
      new Blob([payload.html], { type: "text/html" }),
      "index.html",
    );
    formData.append("emulatedMediaType", "print");

    const response = await fetch(
      `${gotenbergUrl}/forms/chromium/convert/html`,
      {
        body: formData,
        headers,
        method: "POST",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const details = await readErrorBody(response);
      throw new Error(
        `Gotenberg respondio ${response.status}${
          details ? `: ${details.slice(0, 500)}` : ""
        }`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Gotenberg no respondio a tiempo en ${gotenbergUrl}`
        : error instanceof Error
          ? error.message
          : String(error);

    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) {
      throw new Error(
        `No se pudo conectar con Gotenberg en ${gotenbergUrl}. Revisa GOTENBERG_URL y que el contenedor este arrancado.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
