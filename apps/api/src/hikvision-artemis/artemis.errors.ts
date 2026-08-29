export class ArtemisNotConfiguredError extends Error {
  constructor(scope = 'Artemis') {
    super(`Credenciales ${scope} no configuradas`);
    this.name = 'ArtemisNotConfiguredError';
  }
}

export class ArtemisApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path: string,
  ) {
    super(`[${code}] ${message} (${path})`);
    this.name = 'ArtemisApiError';
  }
}
