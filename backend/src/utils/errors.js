export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = 'Not found') {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(message, code = 'CONFLICT') {
  return new AppError(409, code, message);
}

export function forbidden(message, code = 'FORBIDDEN') {
  return new AppError(403, code, message);
}

export function unauthorized(message = 'Unauthorized') {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function badRequest(message, details) {
  return new AppError(400, 'BAD_REQUEST', message, details);
}
