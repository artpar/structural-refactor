import { messaging } from './lib/messaging';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  messaging.handle(msg, sender, sendResponse);
  return true;
});
