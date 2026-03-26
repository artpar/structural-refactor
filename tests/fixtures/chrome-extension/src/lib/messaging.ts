export const messaging = {
  handle(msg: any, sender: any, sendResponse: any) {
    console.log('received', msg);
    sendResponse({ ok: true });
  },
  send(msg: any) {
    chrome.runtime.sendMessage(msg);
  },
};
