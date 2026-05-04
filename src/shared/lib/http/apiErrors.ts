export function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      response?: { data?: { details?: string; error?: string } };
      message?: string;
    };

    return (
      candidate.response?.data?.details ||
      candidate.response?.data?.error ||
      candidate.message ||
      fallback
    );
  }

  return fallback;
}
