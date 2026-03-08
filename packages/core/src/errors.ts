export class GrapeError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GrapeError';
    this.code = code;
  }
}

export class RpcError extends GrapeError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'RpcError';
  }
}

