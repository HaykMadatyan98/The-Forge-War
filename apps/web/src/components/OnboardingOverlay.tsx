'use client';

import {
  currentOnboardingStep,
  dismissOnboardingStep,
  isOnboardingOverlayVisible,
  onboardingStepKeys,
  onboardingStepTab,
  t,
} from '@tfw/game';
import type { HubTab } from './HubNav';

export function OnboardingOverlay({
  state,
  hubTab,
  onGoTab,
  onPersist,
}: {
  state: any;
  hubTab: HubTab;
  onGoTab: (tab: HubTab) => void;
  onPersist: () => void;
}) {
  if (!state || !isOnboardingOverlayVisible(state)) return null;

  const step = currentOnboardingStep(state);
  if (!step) return null;

  const keys = onboardingStepKeys(step);
  const targetTab = onboardingStepTab(step);
  const onTarget = hubTab === targetTab;

  return (
    <div className="onboarding-overlay" role="dialog" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <div className="onboarding-step-badge muted">
          {t('onboardingLabel')} · {step === 'forge' ? '1' : step === 'barracks' ? '2' : '3'}/3
        </div>
        <b id="onboarding-title">{t(keys.title)}</b>
        <p className="muted">{t(keys.detail)}</p>
        <div className="onboarding-actions">
          {!onTarget ? (
            <button type="button" className="primary" onClick={() => onGoTab(targetTab)}>
              {t('onboardingGo')}
            </button>
          ) : (
            <span className="muted onboarding-here">{t('onboardingHere')}</span>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              dismissOnboardingStep(state, step);
              onPersist();
            }}
          >
            {t('onboardingDismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}
