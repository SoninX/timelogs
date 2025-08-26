// content.js
;(() => {
  const extractWorkItemInfo = () => {
    const url = window.location.href;
    const workItemMatch = url.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/);

    if (workItemMatch) {
      const [, org, project, workItemId] = workItemMatch;
      // Use a short delay to allow the page's reactive UI to load the title
      setTimeout(() => {
        const titleElement = document.querySelector('input[aria-label="Title"]');
        const workItemTitle = titleElement ? titleElement.value : `Work Item ${workItemId}`;

        const workItemInfo = {
          id: Number.parseInt(workItemId),
          title: workItemTitle,
          organization: decodeURIComponent(org),
          project: decodeURIComponent(project),
        };

        chrome.runtime.sendMessage({
          type: "WORK_ITEM_DETECTED",
          workItem: workItemInfo,
        });
      }, 500);
      return true;
    }
    return false;
  };

  const clearWorkItem = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_WORK_ITEM" });
  };

  const runDetection = () => {
    if (!extractWorkItemInfo()) {
      clearWorkItem();
    }
  };

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "RUN_DETECTION") {
      runDetection();
      sendResponse({ success: true });
    }
    return true;
  });

  // Run detection on initial script injection
  runDetection();
})();