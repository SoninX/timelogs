;(() => {
  console.log("[v0] Content script loaded on:", window.location.href)

  function extractWorkItemInfo() {
    const url = window.location.href
    console.log("[v0] Checking URL:", url)

    // Pattern: https://dev.azure.com/{org}/{project}/_workitems/edit/{id}
    const workItemMatch = url.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/)

    if (workItemMatch) {
      const [, org, project, workItemId] = workItemMatch

      const decodedOrg = decodeURIComponent(org)
      const decodedProject = decodeURIComponent(project)

      console.log("[v0] Found work item:", { org: decodedOrg, project: decodedProject, workItemId })

      // Try to get additional info from the DOM
      let workItemTitle = ""
      let workItemType = ""

      // Wait a bit for the page to load
      setTimeout(() => {
        const titleElement = document.querySelector(
          '[data-testid="work-item-form-title"] input, .work-item-form-title input, .wit-title-textbox, input[aria-label*="Title"]',
        )
        if (titleElement) {
          workItemTitle = titleElement.value || titleElement.textContent || ""
        }

        // Try to get work item type from various possible locations
        const typeElement = document.querySelector(
          '[data-testid="work-item-type"], .work-item-type-icon, .wit-type-icon, [aria-label*="Work item type"]',
        )
        if (typeElement) {
          workItemType = typeElement.getAttribute("aria-label") || typeElement.title || typeElement.textContent || ""
        }

        if (!workItemTitle && document.title) {
          // Try multiple patterns for title extraction
          const titlePatterns = [
            /^(.+?)\s*-\s*Azure DevOps/,
            /^(.+?)\s*-\s*Visual Studio Team Services/,
            /^(.+?)\s*\|\s*Azure DevOps/,
          ]

          for (const pattern of titlePatterns) {
            const titleMatch = document.title.match(pattern)
            if (titleMatch) {
              workItemTitle = titleMatch[1].trim()
              break
            }
          }
        }

        const workItemInfo = {
          id: Number.parseInt(workItemId),
          title: workItemTitle,
          type: workItemType,
          organization: decodedOrg,
          project: decodedProject,
          url: url,
        }

        console.log("[v0] Extracted work item info:", workItemInfo)

        try {
          window.chrome.runtime.sendMessage(
            {
              type: "WORK_ITEM_DETECTED",
              workItem: workItemInfo,
            },
            (response) => {
              if (window.chrome.runtime.lastError) {
                console.error("[v0] Error sending work item message:", window.chrome.runtime.lastError)
              } else {
                console.log("[v0] Work item message sent successfully")
              }
            },
          )
        } catch (error) {
          console.error("[v0] Exception sending work item message:", error)
        }
      }, 1500) // Increased timeout to allow more time for page loading

      return true
    }

    return false
  }

  // Check immediately
  if (extractWorkItemInfo()) {
    console.log("[v0] Work item page detected")
  } else {
    console.log("[v0] Not a work item page")
    // Clear any stored work item info when not on a work item page
    try {
      window.chrome.runtime.sendMessage(
        {
          type: "CLEAR_WORK_ITEM",
        },
        (response) => {
          if (window.chrome.runtime.lastError) {
            console.error("[v0] Error sending clear message:", window.chrome.runtime.lastError)
          } else {
            console.log("[v0] Clear work item message sent successfully")
          }
        },
      )
    } catch (error) {
      console.error("[v0] Exception sending clear message:", error)
    }
  }

  // Also check when URL changes (for SPA navigation)
  let lastUrl = window.location.href
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href
      console.log("[v0] URL changed, re-checking:", lastUrl)
      setTimeout(() => {
        if (!extractWorkItemInfo()) {
          try {
            window.chrome.runtime.sendMessage(
              {
                type: "CLEAR_WORK_ITEM",
              },
              (response) => {
                if (window.chrome.runtime.lastError) {
                  console.error("[v0] Error sending clear message on URL change:", window.chrome.runtime.lastError)
                } else {
                  console.log("[v0] Clear work item message sent successfully on URL change")
                }
              },
            )
          } catch (error) {
            console.error("[v0] Exception sending clear message on URL change:", error)
          }
        }
      }, 1000) // Increased timeout for URL changes
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
})()
