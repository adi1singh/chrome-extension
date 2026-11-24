const EVENT_NAME = 'jobgen-progress-event';

export const ProgressEventTypes = {
  START: 'start',
  UPDATE: 'update',
  ERROR: 'error',
  RESET: 'reset'
};

export function dispatchProgressEvent(detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  const eventDetail = {
    timestamp: Date.now(),
    ...detail
  };

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: eventDetail }));
}

export function subscribeToProgressEvents(callback) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }

  const handler = (event) => {
    if (event?.detail) {
      callback(event.detail);
    }
  };

  window.addEventListener(EVENT_NAME, handler);

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

export function deriveProgressMessage({ detail, previousMessage = '', mode }) {
  if (!detail) return previousMessage;

  const action = detail.action;
  const pageTitle = detail.pageTitle;

  if (action === 'filling' && pageTitle) {
    return `Filling: ${pageTitle}`;
  }

  if (action === 'finished' && pageTitle && mode !== 'apply') {
    return `Finished: ${pageTitle}`;
  }

  if (action === 'submitted' && mode === 'apply') {
    return 'Application Submitted!';
  }

  if (detail.message) {
    return detail.message;
  }

  return previousMessage;
}

export function createProgressEventHandler({
  site,
  resolveLabel = (mode, explicit) => explicit || '',
  setProgressState,
  setPanelState,
  clearAutoClose,
  scheduleAutoClose,
  resetProgressState
}) {
  return (event) => {
    if (!event) return;
    if (site && event.site && event.site !== site) return;

    const mode = event.mode || 'autofill';
    const label = resolveLabel(mode, event.label);

    if (event.type === ProgressEventTypes.START) {
      clearAutoClose?.();
      setProgressState({
        mode,
        status: 'running',
        label,
        message: deriveProgressMessage({ detail: event, previousMessage: '', mode }),
        error: null,
        currentPage: event.pageTitle || '',
        action: event.action || 'filling'
      });

      setPanelState?.(prev => ({
        ...prev,
        currentView: 'progress',
        isVisible: true,
        isMinimized: false
      }));
      return;
    }

    if (event.type === ProgressEventTypes.UPDATE) {
      setProgressState(prev => ({
        ...prev,
        mode,
        // status: event.action === 'submitted' ? 'completed' : (prev.status === 'error' ? 'running' : prev.status),
        status: event.action === 'submitted' || (event.action === 'finished')? 'completed': (prev.status === 'error' ? 'running' : prev.status),
        label,
        message: deriveProgressMessage({ detail: event, previousMessage: prev.message, mode }),
        error: null,
        currentPage: event.pageTitle || prev.currentPage,
        action: event.action || prev.action
      }));

      if (event.action === 'submitted') {
        scheduleAutoClose?.();
      }
      return;
    }

    if (event.type === ProgressEventTypes.ERROR) {
      clearAutoClose?.();
      setProgressState(prev => ({
        ...prev,
        mode,
        status: 'error',
        label,
        error: event.message || 'Autofill encountered an error.',
        message: event.message ? `Error: ${event.message}` : '',
        currentPage: prev.currentPage,
        action: 'error'
      }));
      return;
    }

    if (event.type === ProgressEventTypes.RESET) {
      clearAutoClose?.();
      resetProgressState?.();

      setPanelState?.(prev => ({
        ...prev,
        currentView: 'main'
      }));
    }
  };
}

export function createProgressEmitters(site) {
  let currentMode = 'autofill';

  return {
    start(mode = 'autofill', pageTitle = '', action = 'filling', extra = {}) {
      currentMode = mode;
      dispatchProgressEvent({
        site,
        type: ProgressEventTypes.START,
        mode,
        pageTitle,
        action,
        ...extra
      });
    },
    update(pageTitle, action = 'filling', extra = {}) {
      dispatchProgressEvent({
        site,
        type: ProgressEventTypes.UPDATE,
        mode: currentMode,
        pageTitle,
        action,
        ...extra
      });
    },
    error(message, extra = {}) {
      dispatchProgressEvent({
        site,
        type: ProgressEventTypes.ERROR,
        mode: currentMode,
        message,
        ...extra
      });
    }
  };
}
