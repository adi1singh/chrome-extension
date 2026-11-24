// Always address the tab that initiated the request, even if focus changes.
export async function broadcastAutofill(data, sender, api = chrome) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { success: false, error: 'Autofill requires a requesting tab' };
  }
  if (!['autofill', 'apply'].includes(data?.action)) {
    return { success: false, error: 'Invalid autofill action' };
  }
  try {
    const frames = await new Promise((resolve, reject) => {
      api.webNavigation.getAllFrames({ tabId }, (result) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result || []);
      });
    });
    const frameIds = [...new Set(frames.map(frame => frame.frameId))]
      .filter(id => Number.isInteger(id) && id >= 0);
    if (!frameIds.length) return { success: false, error: 'No tab frames found' };
    const results = await Promise.all(frameIds.map(frameId => new Promise(resolve => {
      api.tabs.sendMessage(tabId, { action: 'AUTOFILL_FRAME', data }, { frameId }, response => {
        const error = api.runtime.lastError;
        resolve({ frameId, success: !error && response?.success === true });
      });
    })));
    const framesAcknowledged = results.filter(result => result.success).length;
    return {
      success: framesAcknowledged > 0,
      tabId,
      framesContacted: frameIds.length,
      framesAcknowledged,
      ...(framesAcknowledged ? {} : { error: 'No frame accepted the autofill request' })
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
