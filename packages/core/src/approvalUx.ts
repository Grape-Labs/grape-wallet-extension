export function approvalAuthenticationMethod(options: { requiresReauth: boolean; passkey: boolean; deviceAvailable: boolean; passwordFallback: boolean }): 'none' | 'passkey' | 'device' | 'password' {
  if (!options.requiresReauth) return 'none';
  if (options.passkey) return 'passkey';
  return options.deviceAvailable && !options.passwordFallback ? 'device' : 'password';
}

export function approvalWarningCopy(warning: string): string {
  if (warning === 'Instruction targets an unknown program.') return 'Grape does not recognize one of the apps used by this transaction. Its effects may not be fully shown. Only approve if you trust the site and understand the request.';
  return warning;
}
export const UNAVAILABLE_BALANCE_PREVIEW = 'Grape could not estimate how this request will change your balance. This does not mean there are no changes. Only approve if you understand and trust the request.';
