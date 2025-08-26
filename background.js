// Declare chrome variable to fix lint/correctness/noUndeclaredVariables error
const chrome = globalThis.chrome || self.chrome

let currentWorkItem = null

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[v0] Background received message:", message, "from sender:", sender)

  if (message.type === "WORK_ITEM_DETECTED") {
    currentWorkItem = message.workItem
    console.log("[v0] Stored current work item:", currentWorkItem)
    if (currentWorkItem && typeof currentWorkItem.id === "string") {
      currentWorkItem.id = Number.parseInt(currentWorkItem.id)
    }
    sendResponse({ success: true })
  } else if (message.type === "CLEAR_WORK_ITEM") {
    currentWorkItem = null
    console.log("[v0] Cleared current work item")
    sendResponse({ success: true })
  } else if (message.type === "GET_CURRENT_WORK_ITEM") {
    console.log("[v0] Returning current work item:", currentWorkItem)
    sendResponse(currentWorkItem)
  }

  return true
})

// Clear work item info when tab is closed or navigated away from Azure DevOps
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && !changeInfo.url.includes("dev.azure.com")) {
    currentWorkItem = null
    console.log("[v0] Cleared work item - navigated away from Azure DevOps")
  }
})

console.log("[v0] Background script loaded")
