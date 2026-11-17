import type { FoxMissionStatus } from '../shared/fox-missions';
const PREFIX = 'grape:fox-reminder:';
type Reminder = { owner: string; mint: string; enabled: boolean; mission?: string; endsAt?: number; notifiedMission?: string };
const name = (owner: string, mint: string) => `${PREFIX}${owner}:${mint}`;
const valid = (r: any): r is Reminder => r && typeof r.enabled === 'boolean' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.owner) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(r.mint);
/** Local, opt-in reminders. No wallet secret, transaction, or remote push service. */
export class FoxMissionReminders {
  private readonly jobs = new Map<string, Promise<unknown>>();
  private run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.jobs.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.jobs.set(key, next);
    void next.finally(() => { if (this.jobs.get(key) === next) this.jobs.delete(key); }).catch(() => {});
    return next;
  }
  constructor(private readonly readStatus: (owner: string, mint: string) => Promise<FoxMissionStatus | null>) {}
  async enabled(owner: string, mint: string) {
    const key = name(owner, mint), record = (await chrome.storage.local.get(key))[key];
    return valid(record) && record.enabled && await chrome.permissions.contains({ permissions: ['notifications'] });
  }
  set(status: FoxMissionStatus, enabled: boolean) { return this.run(name(status.owner, status.mint), () => this.setInternal(status, enabled)); }
  private async setInternal(status: FoxMissionStatus, enabled: boolean) {
    const key = name(status.owner, status.mint);
    if (enabled && (!status.eligible || status.held === false || !await chrome.permissions.contains({ permissions: ['notifications'] }))) throw new Error('Enable browser notifications to receive mission reminders.');
    const existing = (await chrome.storage.local.get(key))[key];
    const record: Reminder = { owner: status.owner, mint: status.mint, enabled, notifiedMission: valid(existing) ? existing.notifiedMission : undefined };
    await chrome.storage.local.set({ [key]: record });
    await chrome.alarms.clear(key);
    if (enabled) await this.syncInternal(status);
    return enabled;
  }
  sync(status: FoxMissionStatus) { return this.run(name(status.owner, status.mint), () => this.syncInternal(status)); }
  private async syncInternal(status: FoxMissionStatus) {
    const key = name(status.owner, status.mint), record = (await chrome.storage.local.get(key))[key];
    if (!valid(record) || !record.enabled) return;
    if (!status.eligible || status.held === false) { await chrome.storage.local.remove(key); await chrome.alarms.clear(key); return; }
    if (!status.mission || !['locked', 'claimable'].includes(status.state)) { await chrome.alarms.clear(key); return; }
    if (record.notifiedMission === status.mission.address) return;
    const endsAt = status.mission.endsAt;
    if (!Number.isSafeInteger(endsAt) || endsAt <= 0) return;
    await chrome.storage.local.set({ [key]: { ...record, mission: status.mission.address, endsAt } });
    if (await chrome.permissions.contains({ permissions: ['notifications'] })) await chrome.alarms.create(key, { when: Math.max(Date.now() + 1000, endsAt * 1000) });
  }
  handle(alarmName: string) { return this.run(alarmName, () => this.handleInternal(alarmName)); }
  private async handleInternal(alarmName: string) {
    if (!alarmName.startsWith(PREFIX)) return;
    const record = (await chrome.storage.local.get(alarmName))[alarmName];
    if (!valid(record) || !record.enabled || !await chrome.permissions.contains({ permissions: ['notifications'] })) return;
    try {
      const status = await this.readStatus(record.owner, record.mint);
      if (!status || !status.eligible || status.held === false) { await chrome.storage.local.remove(alarmName); await chrome.alarms.clear(alarmName); return; }
      if (!status.mission || status.state === 'ready' || status.state === 'unavailable') { await chrome.alarms.clear(alarmName); return; }
      if (status.mission.address !== record.mission || status.state !== 'claimable' || status.pending || Date.now() < status.mission.endsAt * 1000) {
        await this.syncInternal(status);
        // Chain results may lag the scheduled end. Never notify that a still-locked Fox is free.
        const current = (await chrome.storage.local.get(alarmName))[alarmName];
        if (valid(current) && current.enabled && current.notifiedMission !== status.mission.address && status.mission.endsAt * 1000 <= Date.now()) await chrome.alarms.create(alarmName, { when: Date.now() + 5 * 60_000 });
        return;
      }
      const current = (await chrome.storage.local.get(alarmName))[alarmName];
      if (!valid(current) || !current.enabled || current.notifiedMission === status.mission.address) return;
      await chrome.notifications.create(alarmName, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/grape_logo_white-128.png'), title: 'Your Fox mission has ended', message: 'Open Grape to claim your Fox and review the next mission. A new mission still requires your approval.', priority: 1 });
      await chrome.storage.local.set({ [alarmName]: { ...current, notifiedMission: status.mission.address } });
      await chrome.alarms.clear(alarmName);
    } catch { await chrome.alarms.create(alarmName, { when: Date.now() + 5 * 60_000 }); }
  }
  async restore() {
    const records = await chrome.storage.local.get(null);
    for (const [key, record] of Object.entries(records)) {
      if (!key.startsWith(PREFIX) || !valid(record) || !record.enabled) continue;
      if (!await chrome.permissions.contains({ permissions: ['notifications'] })) { await chrome.alarms.clear(key); continue; }
      // Entries without a scheduled mission wait for the next status read/deployment.
      if (record.mission && record.mission !== record.notifiedMission && record.endsAt) await chrome.alarms.create(key, { when: Math.max(Date.now() + 1000, record.endsAt * 1000) });
    }
  }
  async clicked(id: string) {
    if (!id.startsWith(PREFIX)) return;
    const record = (await chrome.storage.local.get(id))[id];
    if (!valid(record)) return;
    const query = new URLSearchParams({ foxMission: record.mint, owner: record.owner });
    await chrome.tabs.create({ url: chrome.runtime.getURL(`wallet.html?${query}`) });
    await chrome.notifications.clear(id);
  }
}
