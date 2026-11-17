import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoxMissionReminders } from './fox-mission-reminders';
import type { FoxMissionStatus } from '../shared/fox-missions';
const owner = '11111111111111111111111111111111', mint = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const alarm = `grape:fox-reminder:${owner}:${mint}`;
const locked: FoxMissionStatus = { owner, mint, eligible: true, state: 'locked', canStart: false, canClaim: false, mission: { address: 'mission-A', name: 'Mission A', opensAt: 1, closesAt: 2, endsAt: 2000, fame: '150' } };
let records: Record<string, any>, allowed: boolean, notifications: any, alarms: any, tabs: any;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1000_000); records = {}; allowed = true;
  notifications = { create: vi.fn(async () => 'notification'), clear: vi.fn(async () => true) };
  alarms = { create: vi.fn(async () => {}), clear: vi.fn(async () => true) }; tabs = { create: vi.fn(async () => ({})) };
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async (key: string | null) => structuredClone(key ? { [key]: records[key] } : records)), set: vi.fn(async (value: any) => Object.assign(records, structuredClone(value))), remove: vi.fn(async (key: string) => { delete records[key]; }) } }, permissions: { contains: vi.fn(async () => allowed) }, alarms, notifications, tabs, runtime: { getURL: (path: string) => `chrome-extension://grape/${path}` } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('opt-in Fox mission reminders', () => {
  it('does not schedule notifications before opt-in', async () => {
    const reminders = new FoxMissionReminders(vi.fn()); await reminders.sync(locked); expect(alarms.create).not.toHaveBeenCalled();
  });
  it('schedules the known on-chain end and persists across worker restart', async () => {
    const reminders = new FoxMissionReminders(vi.fn()); await reminders.set(locked, true);
    expect(alarms.create).toHaveBeenCalledWith(alarm, { when: 2000_000 });
    alarms.create.mockClear(); await new FoxMissionReminders(vi.fn()).restore(); expect(alarms.create).toHaveBeenCalledWith(alarm, { when: 2000_000 });
  });
  it('does not silently enable notifications when permission is denied', async () => {
    allowed = false; await expect(new FoxMissionReminders(vi.fn()).set(locked, true)).rejects.toThrow('notifications'); expect(records[alarm]).toBeUndefined();
  });
  it('rechecks ownership and mission state, then notifies once per mission', async () => {
    const read = vi.fn(async () => ({ ...locked, state: 'claimable' as const })); const r = new FoxMissionReminders(read); await r.set(locked, true); vi.setSystemTime(2000_000);
    await Promise.all([r.handle(alarm), r.handle(alarm)]); expect(read).toHaveBeenCalledWith(owner, mint); expect(notifications.create).toHaveBeenCalledTimes(1);
    const data = notifications.create.mock.calls[0][1]; expect(data.message).toContain('claim'); expect(data.message).not.toContain(owner); expect(data.message).not.toContain(mint);
  });
  it('waits when the chain still reports a locked Fox at the scheduled end', async () => {
    const r = new FoxMissionReminders(vi.fn(async () => locked)); await r.set(locked, true); vi.setSystemTime(2000_000); await r.handle(alarm);
    expect(notifications.create).not.toHaveBeenCalled(); expect(alarms.create).toHaveBeenLastCalledWith(alarm, { when: 2300_000 });
  });
  it('cancels when the NFT is no longer held or the wallet was removed', async () => {
    const r = new FoxMissionReminders(vi.fn(async () => null)); await r.set(locked, true); await r.handle(alarm); expect(records[alarm]).toBeUndefined(); expect(notifications.create).not.toHaveBeenCalled();
  });
  it('removes the reminder when the verified collection remains valid but ownership is lost', async () => {
    const r = new FoxMissionReminders(vi.fn(async () => ({ ...locked, held: false, state: 'unavailable' as const })));
    await r.set(locked, true); await r.handle(alarm); expect(records[alarm]).toBeUndefined(); expect(notifications.create).not.toHaveBeenCalled();
  });
  it('defers an end reminder while a mission transaction is pending', async () => {
    const r = new FoxMissionReminders(vi.fn(async () => ({ ...locked, state: 'claimable' as const, pending: true })));
    await r.set(locked, true); vi.setSystemTime(2000_000); await r.handle(alarm); expect(notifications.create).not.toHaveBeenCalled(); expect(alarms.create).toHaveBeenLastCalledWith(alarm, { when: 2300_000 });
  });
  it('checks overdue reminders on the next browser startup', async () => {
    const r = new FoxMissionReminders(vi.fn()); await r.set(locked, true); vi.setSystemTime(2500_000); alarms.create.mockClear(); await new FoxMissionReminders(vi.fn()).restore(); expect(alarms.create).toHaveBeenCalledWith(alarm, { when: 2501_000 });
  });
  it('does not notify after the Fox has already been claimed', async () => {
    const r = new FoxMissionReminders(vi.fn(async () => ({ ...locked, state: 'ready' as const }))); await r.set(locked, true); await r.handle(alarm); expect(notifications.create).not.toHaveBeenCalled();
  });
  it('reschedules when a Fox is already deployed on a different mission', async () => {
    const next = { ...locked, mission: { ...locked.mission!, address: 'mission-B', endsAt: 3000 } }; const r = new FoxMissionReminders(vi.fn(async () => next)); await r.set(locked, true); vi.setSystemTime(2000_000); await r.handle(alarm);
    expect(records[alarm].mission).toBe('mission-B'); expect(alarms.create).toHaveBeenLastCalledWith(alarm, { when: 3000_000 }); expect(notifications.create).not.toHaveBeenCalled();
  });
  it('stays enabled for future missions without repeating the old reminder', async () => {
    const r = new FoxMissionReminders(vi.fn(async () => ({ ...locked, state: 'claimable' as const }))); await r.set(locked, true); vi.setSystemTime(2000_000); await r.handle(alarm);
    await r.sync({ ...locked, mission: { ...locked.mission!, address: 'mission-B', endsAt: 3000 } }); expect(records[alarm].enabled).toBe(true); expect(alarms.create).toHaveBeenLastCalledWith(alarm, { when: 3000_000 });
  });
  it('honors opt-out, including concurrent status sync', async () => {
    const r = new FoxMissionReminders(vi.fn()); await r.set(locked, true); await Promise.all([r.sync(locked), r.set(locked, false)]); expect(records[alarm].enabled).toBe(false);
    await r.handle(alarm); expect(notifications.create).not.toHaveBeenCalled();
  });
  it('retries transient RPC failure without issuing a false reminder', async () => {
    const r = new FoxMissionReminders(vi.fn(async () => { throw new Error('offline'); })); await r.set(locked, true); await r.handle(alarm); expect(notifications.create).not.toHaveBeenCalled(); expect(alarms.create).toHaveBeenLastCalledWith(alarm, { when: 1300_000 });
  });
  it('opens the matching Fox in the wallet when the notification is clicked', async () => {
    const r = new FoxMissionReminders(vi.fn()); await r.set(locked, true); await r.clicked(alarm);
    const url = new URL(tabs.create.mock.calls[0][0].url); expect(url.pathname).toBe('/wallet.html'); expect(url.searchParams.get('foxMission')).toBe(mint); expect(url.searchParams.get('owner')).toBe(owner);
  });
});
