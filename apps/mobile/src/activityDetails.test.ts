import { describe, expect, it } from 'vitest';
import { activityStatusLabel } from './activityDetails';
describe('activity confirmation labels', () => {
  it('separates bridge source confirmation from delivery', () => {
    expect(activityStatusLabel('success', 'bridge')).toBe('Source confirmed');
    expect(activityStatusLabel('success', 'send')).toBe('Confirmed');
  });
  it('preserves pending and failed states', () => {
    expect(activityStatusLabel('unknown', 'send')).toBe('Pending');
    expect(activityStatusLabel('failed', 'bridge')).toBe('Failed');
  });
});
