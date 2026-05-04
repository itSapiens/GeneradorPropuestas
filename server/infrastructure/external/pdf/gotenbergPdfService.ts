const DEFAULT_GOTENBERG_TIMEOUT_MS = 30_000;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
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
