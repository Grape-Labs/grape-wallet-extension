export const FOX_COLLECTIONS = ['BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac', 'Gwr8Vc3YG7kzj7BG44bXMCUi8N2P7FygcLECDcWySnop', 'HbPtffcEzzSzZ1VJaTjaAJqTUQpfNeMkPqNG81dWE2Bi'] as const;
export type FoxMissionStatus = { powerups?: FoxPowerup[]; eligible: boolean; held?: boolean; mint: string; owner: string; fame?: string; completedMissions?: string; state: 'ready' | 'locked' | 'claimable' | 'unavailable'; reason?: string; mission?: { address: string; name: string; opensAt: number; closesAt: number; endsAt: number; fame: string }; canStart: boolean; canClaim: boolean; signature?: string; pending?: boolean; reminderEnabled?: boolean };
export type FoxMissionPreview = { powerup?: FoxPowerup; id: string; action: 'start' | 'claim'; mint: string; mission: string; missionName: string; endsAt: number; networkFeeLamports: number; estimatedDebitLamports: number; expiresAt: number };
export type FoxMissionResult = { signature: string; confirmed: boolean; error?: string };

// Official consumable mint list: https://dens.famousfoxes.com/consumables.json
export const FOX_POWERUPS = [
  {
    "mint": "4i5n8KYEYy8vok3Xgr9qAUXsasGvRCo9AsiDovu9fpYy",
    "name": "Basic Fishing Rod",
    "powerType": "absolute",
    "power": 50
  },
  {
    "mint": "8rchXV6K8nnwLJjW75usYKtSTnhia9H6ynd3kpNW1oQc",
    "name": "The Centurion Spear",
    "powerType": "absolute",
    "power": 100
  },
  {
    "mint": "FHPxQnmf4bPptPE1jLa4LVNowCZ799pyRg5uw6gesnhe",
    "name": "Green Blade of Cope",
    "powerType": "percentage",
    "power": 15
  }
] as const;
export type FoxPowerup = { mint: string; name: string; power: number; powerType: string; balance: string };
