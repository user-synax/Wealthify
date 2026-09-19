/* Every route rejects with this shape so index.js can serialise failures in
   one place. `code` is the stable contract the client switches on; `message`
   is for humans; `fields` drives inline form errors; `details` carries the
   numbers an error screen needs to explain itself (e.g. the shortfall on a
   declined payment). */
export class HttpError extends Error {
  constructor(code, status = 400, { message, fields, details } = {}) {
    super(message ?? code);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        ...(this.message && this.message !== this.code ? { message: this.message } : {}),
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const badRequest = (code, options) => new HttpError(code, 400, options);
export const unauthorized = (code = "UNAUTHENTICATED") => new HttpError(code, 401);
export const paymentRequired = (code, options) => new HttpError(code, 402, options);
export const forbidden = (code, options) => new HttpError(code, 403, options);
export const notFound = (code = "NOT_FOUND", options) => new HttpError(code, 404, options);
export const conflict = (code, options) => new HttpError(code, 409, options);
export const preconditionFailed = (code, options) => new HttpError(code, 428, options);
export const tooMany = (code, options) => new HttpError(code, 429, options);
