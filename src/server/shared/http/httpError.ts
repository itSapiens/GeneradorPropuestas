export class HttpError extends Error {
  status: number;
  details?: string;

  constructor(status: number, message: string, details?: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details?: string) {
  return new HttpError(400, message, details);
}

export function unauthorized(message: string, details?: string) {
  return new HttpError(401, message, details);
}

export function notFound(message: string, details?: string) {
  return new HttpError(404, message, details);
}

export function conflict(message: string, details?: string) {
  return new HttpError(409, message, details);
}

export function gone(message: string, details?: string) {
  return new HttpError(410, message, details);
}

export function internalServerError(message: string, details?: string) {
  return new HttpError(500, message, details);
}
