import { isQuestObjectiveMet } from './quests';

export type OnboardingStepId = 'forge' | 'barracks' | 'campaign';

export type HubTabId =
  | 'campaign'
  | 'quests'
  | 'arena'
  | 'mine'
  | 'forge'
  | 'research'
  | 'barracks'
  | 'tavern'
  | 'inventory'
  | 'profile'
  | 'social';

/** Early game ends after first campaign mission. */
export function onboardingComplete(state: any): boolean {
  if (!state) return true;
  if (state.flags?.onboardingDone) return true;
  return !!state.campaign?.cleared?.fields_1;
}

export function markOnboardingDone(state: any) {
  if (!state.flags) state.flags = {};
  state.flags.onboardingDone = true;
}

/** Tabs visible before first campaign win. */
const EARLY_TABS = new Set<HubTabId>(['campaign', 'quests', 'forge', 'barracks', 'mine']);

export function hubTabUnlocked(state: any, tab: HubTabId): boolean {
  if (onboardingComplete(state)) return true;
  return EARLY_TABS.has(tab);
}

export function currentOnboardingStep(state: any): OnboardingStepId | null {
  if (!state || onboardingComplete(state)) return null;
  if (!isQuestObjectiveMet(state, 'craft_weapon')) return 'forge';
  if (!isQuestObjectiveMet(state, 'equip_squad')) return 'barracks';
  if (!isQuestObjectiveMet(state, 'clear_fields_1')) return 'campaign';
  return null;
}

export function onboardingStepTab(step: OnboardingStepId): HubTabId {
  return step;
}

export function onboardingStepKeys(step: OnboardingStepId): { title: string; detail: string } {
  switch (step) {
    case 'forge':
      return { title: 'onboardingStepForge', detail: 'onboardingStepForgeDetail' };
    case 'barracks':
      return { title: 'onboardingStepBarracks', detail: 'onboardingStepBarracksDetail' };
    case 'campaign':
      return { title: 'onboardingStepCampaign', detail: 'onboardingStepCampaignDetail' };
  }
}

function onboardingFlags(state: any) {
  if (!state.flags) state.flags = {};
  if (!state.flags.onboarding) state.flags.onboarding = { dismissed: {} };
  if (!state.flags.onboarding.dismissed) state.flags.onboarding.dismissed = {};
  return state.flags.onboarding as { dismissed: Record<string, boolean> };
}

export function isOnboardingOverlayVisible(state: any): boolean {
  const step = currentOnboardingStep(state);
  if (!step) return false;
  const f = onboardingFlags(state);
  return !f.dismissed[step];
}

export function dismissOnboardingStep(state: any, step: OnboardingStepId) {
  const f = onboardingFlags(state);
  f.dismissed[step] = true;
}
