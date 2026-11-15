import { expect, it } from 'vitest';
import { approvalAuthenticationMethod, approvalWarningCopy } from './approvalUx';
it('uses the preferred authentication method with an explicit password fallback', () => {
  const options = { requiresReauth: true, passkey: false, deviceAvailable: true, passwordFallback: false };
  expect(approvalAuthenticationMethod(options)).toBe('device');
  expect(approvalAuthenticationMethod({ ...options, passwordFallback: true })).toBe('password');
  expect(approvalAuthenticationMethod({ ...options, deviceAvailable: false })).toBe('password');
  expect(approvalAuthenticationMethod({ ...options, passkey: true, passwordFallback: true })).toBe('passkey');
  expect(approvalAuthenticationMethod({ ...options, requiresReauth: false })).toBe('none');
});
it('explains unknown programs without claiming they are malicious', () => {
  expect(approvalWarningCopy('Instruction targets an unknown program.')).toContain('Its effects may not be fully shown');
  expect(approvalWarningCopy('Simulation failed')).toBe('Simulation failed');
});
