// background.js
let currentWorkItem = null;

// Listener for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "WORK_ITEM_DETECTED":
      currentWorkItem = message.workItem;
      sendResponse({ success: true, received: "WORK_ITEM_DETECTED" });
      break;
    case "CLEAR_WORK_ITEM":
      currentWorkItem = null;
      sendResponse({ success: true, received: "CLEAR_WORK_ITEM" });
      break;
    case "GET_CURRENT_WORK_ITEM":
      sendResponse(currentWorkItem);
      break;
  }
  return true; // Indicates an asynchronous response
});

// Listener for tab updates to trigger re-scans on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // When a tab finishes loading a URL that includes dev.azure.com
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('dev.azure.com')) {
    // Send a message to the content script in that tab to run its detection logic
    chrome.tabs.sendMessage(tabId, { type: "RUN_DETECTION" }, response => {
      // This can fail if the content script isn't on the page (which is normal).
      // We check chrome.runtime.lastError to prevent an error from appearing in the console.
      if (chrome.runtime.lastError) {
        // console.log("Content script not available on this tab.");
      }
    });
  }
});