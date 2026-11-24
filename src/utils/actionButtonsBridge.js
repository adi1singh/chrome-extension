const actionHandlers = new Set();
const stateListeners = new Set();
let uiState = {
  saveLabel: 'Save',
  saveDisabled: false,
  currentSite: 'linkedin',
  isAuthenticated: false,
  onboardingComplete: true, //untill checking complete
  hasRequiredFieldsMissing: false,
};

export function registerActionButtonHandlers(handlerMap) {
  if (!handlerMap) return () => {};
  actionHandlers.add(handlerMap);
  return () => {
    actionHandlers.delete(handlerMap);
  };
}

export function invokeActionButton(action) {
  if (!action) return false;
  let handled = false;
  actionHandlers.forEach((handlers) => {
    const fn = handlers?.[action];
    if (typeof fn === 'function') {
      try {
        fn();
        handled = true;
      } catch (error) {
        console.error(`JobGen ActionButtons handler failed for ${action}:`, error);
      }
    }
  });
  return handled;
}

export function hasActionButtonHandlers() {
  return actionHandlers.size > 0;
}

export function updateActionButtonState(partial) {
  if (!partial) return;
  uiState = { ...uiState, ...partial };
  stateListeners.forEach((listener) => {
    try {
      listener(uiState);
    } catch (error) {
      console.error('JobGen ActionButtons state listener error:', error);
    }
  });
}

export function subscribeActionButtonState(listener) {
  if (typeof listener !== 'function') return () => {};
  stateListeners.add(listener);
  listener(uiState);
  return () => {
    stateListeners.delete(listener);
  };
}

export function getActionButtonState() {
  return uiState;
}
