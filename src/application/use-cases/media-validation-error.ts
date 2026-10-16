/** A media request the admin can fix; the API maps it to 400. */
export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}
