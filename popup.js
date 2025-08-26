document.addEventListener("DOMContentLoaded", async () => {
  console.log("[v0] Popup DOM loaded, initializing...")

  // Set default dates to today
  const today = new Date().toISOString().split("T")[0]
  document.getElementById("taskDate").value = today
  document.getElementById("filterDate").value = today

  // Load tasks for today by default
  loadTasksForDate(today)

  initializeAzureDevOpsSettings()

  // Add task form submission
  document.getElementById("addTaskForm").addEventListener("submit", (e) => {
    e.preventDefault()
    addTask()
  })

  // Filter date change
  document.getElementById("filterDate").addEventListener("change", (e) => {
    const selectedDate = e.target.value
    if (selectedDate) {
      loadTasksForDate(selectedDate)
    }
  })

  document.getElementById("organizationInput").addEventListener("input", (e) => {
    const org = e.target.value.trim()
    if (org) {
      showProjectSelector(true)
      loadProjectsForAddTask(org)
    } else {
      showProjectSelector(false)
      showWorkItemSelector(false)
    }
  })

  document.getElementById("projectSelector").addEventListener("change", (e) => {
    const projectId = e.target.value
    const org = document.getElementById("organizationInput").value.trim()
    if (projectId && org) {
      showWorkItemSelector(true)
      loadWorkItemsForAddTask(org, projectId)
    } else {
      showWorkItemSelector(false)
    }
  })

  document.getElementById("viewOrgSelector").addEventListener("change", (e) => {
    const org = e.target.value
    if (org) {
      showViewProjectSelector(true)
      loadProjectsForView(org)
    } else {
      showViewProjectSelector(false)
      showViewWorkItemSelector(false)
    }
    applyFilters()
  })

  document.getElementById("viewProjectSelector").addEventListener("change", (e) => {
    const projectId = e.target.value
    const org = document.getElementById("viewOrgSelector").value
    if (projectId && org) {
      showViewWorkItemSelector(true)
      loadWorkItemsForView(org, projectId)
    } else {
      showViewWorkItemSelector(false)
    }
    applyFilters()
  })

  document.getElementById("viewWorkItemSelector").addEventListener("change", () => {
    applyFilters()
  })

  document.getElementById("retryButton").addEventListener("click", async () => {
    console.log("[v0] Retry button clicked - manually detecting work item")

    try {
      // Show loading state
      const retryBtn = document.getElementById("retryButton")
      const originalText = retryBtn.innerHTML
      retryBtn.innerHTML = "⏳"
      retryBtn.disabled = true

      // Query the current active tab to get work item info
      const [tab] = await window.chrome.tabs.query({ active: true, currentWindow: true })

      if (!tab || !tab.url) {
        showMessage("Could not access current tab", "error")
        return
      }

      console.log("[v0] Current tab URL:", tab.url)

      // Check if we're on an Azure DevOps work item page
      const workItemMatch = tab.url.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/)

      if (!workItemMatch) {
        showMessage("Not on an Azure DevOps work item page", "error")
        return
      }

      const [, organization, project, workItemId] = workItemMatch
      console.log("[v0] Detected work item:", { organization, project, workItemId })

      // Send to background script in the format it expects
      const workItemData = {
        organization: decodeURIComponent(organization),
        project: decodeURIComponent(project),
        id: Number.parseInt(workItemId),
        url: tab.url,
        timestamp: Date.now(),
      }

      // Store via background script to maintain consistency
      await new Promise((resolve, reject) => {
        window.chrome.runtime.sendMessage(
          {
            type: "WORK_ITEM_DETECTED",
            workItem: workItemData,
          },
          (response) => {
            if (window.chrome.runtime.lastError) {
              reject(window.chrome.runtime.lastError)
            } else {
              resolve(response)
            }
          },
        )
      })

      showMessage("Work item detected! Attempting to pre-select...", "success")

      // Trigger pre-selection with a slight delay
      setTimeout(async () => {
        await checkAndPreSelectWorkItem()
      }, 500)
    } catch (error) {
      console.error("[v0] Error in retry button:", error)
      showMessage("Error detecting work item: " + error.message, "error")
    } finally {
      // Restore button state
      const retryBtn = document.getElementById("retryButton")
      retryBtn.innerHTML = "🔄"
      retryBtn.disabled = false
    }
  })
})

function showProjectSelector(show) {
  document.getElementById("projectSelectorGroup").style.display = show ? "block" : "none"
  if (!show) {
    document.getElementById("projectSelector").value = ""
  }
}

function showWorkItemSelector(show) {
  document.getElementById("workItemSelectorGroup").style.display = show ? "block" : "none"
  if (!show) {
    document.getElementById("workItemSelector").value = ""
    clearWorkItemsForAddTask()
    clearBacklogItemsForAddTask()
  }
}

function showViewProjectSelector(show) {
  document.getElementById("viewProjectSelectorGroup").style.display = show ? "block" : "none"
  if (!show) {
    document.getElementById("viewProjectSelector").value = ""
  }
}

function showViewWorkItemSelector(show) {
  document.getElementById("viewWorkItemSelectorGroup").style.display = show ? "block" : "none"
  if (!show) {
    document.getElementById("viewWorkItemSelector").value = ""
    clearWorkItemsForView()
    clearBacklogItemsForView()
  }
}

async function addTask() {
  const date = document.getElementById("taskDate").value
  const orgInput = document.getElementById("organizationInput")
  const projectSelector = document.getElementById("projectSelector")
  const workItemSelector = document.getElementById("workItemSelector")
  const selectedOrg = orgInput.value.trim()
  const selectedProject = projectSelector.value
  const selectedWorkItem = workItemSelector.value
  const selectedWorkItemText = workItemSelector.options[workItemSelector.selectedIndex].text
  const hours = Number.parseInt(document.getElementById("hours").value) || 0
  const minutes = Number.parseInt(document.getElementById("minutes").value) || 0

  // Validation
  if (!date || !selectedOrg || !selectedProject || !selectedWorkItem) {
    showMessage("Please fill in all required fields.", "error")
    return
  }

  if (hours === 0 && minutes === 0) {
    showMessage("Please enter at least 1 minute.", "error")
    return
  }

  let workItemInfo = {}
  if (selectedWorkItem.startsWith("wi:") || selectedWorkItem.startsWith("backlog:")) {
    const workItemId = selectedWorkItem.split(":")[1]
    const [title, type] = selectedWorkItemText.split(" - ")
    workItemInfo = {
      id: workItemId,
      title: title,
      type: type,
      organization: selectedOrg,
      project: projectSelector.options[projectSelector.selectedIndex].text,
      projectId: selectedProject,
    }
  }

  try {
    // Get existing data
    const result = await window.chrome.storage.local.get([date])
    const existingTasks = result[date] || []

    // Add new task
    const newTask = {
      task: workItemInfo.title || selectedWorkItemText,
      workItem: workItemInfo,
      hours: hours,
      minutes: minutes,
      timestamp: new Date().toISOString(),
    }

    existingTasks.push(newTask)

    // Save to storage
    await window.chrome.storage.local.set({
      [date]: existingTasks,
    })

    // Reset form
    document.getElementById("hours").value = "0"
    document.getElementById("minutes").value = "0"
    document.getElementById("workItemSelector").value = ""

    // Show success message
    showMessage("Time log added successfully!", "success")

    // Refresh the view if we're looking at the same date
    const filterDate = document.getElementById("filterDate").value
    if (filterDate === date) {
      loadTasksForDate(date)
    }
  } catch (error) {
    console.error("Error saving task:", error)
    showMessage("Error saving task. Please try again.", "error")
  }
}

async function loadTasksForDate(date) {
  try {
    const result = await window.chrome.storage.local.get([date])
    const tasks = result[date] || []

    applyFiltersToTasks(tasks)
  } catch (error) {
    console.error("Error loading tasks:", error)
    showMessage("Error loading tasks.", "error")
  }
}

function applyFilters() {
  const filterDate = document.getElementById("filterDate").value
  if (filterDate) {
    loadTasksForDate(filterDate)
  }
}

async function applyFiltersToTasks(tasks) {
  const selectedOrg = document.getElementById("viewOrgSelector").value
  const selectedProject = document.getElementById("viewProjectSelector").value
  const selectedWorkItem = document.getElementById("viewWorkItemSelector").value

  let filteredTasks = tasks

  // Filter by organization
  if (selectedOrg) {
    filteredTasks = filteredTasks.filter((task) => task.workItem?.organization === selectedOrg)
  }

  // Filter by project
  if (selectedProject) {
    filteredTasks = filteredTasks.filter((task) => task.workItem?.projectId === selectedProject)
  }

  // Filter by work item
  if (selectedWorkItem) {
    const workItemId = selectedWorkItem.split(":")[1]
    filteredTasks = filteredTasks.filter((task) => task.workItem?.id === workItemId)
  }

  displayTasks(filteredTasks)
  displayDailyTotal(filteredTasks)
}

function displayTasks(tasks) {
  const taskList = document.getElementById("taskList")

  if (tasks.length === 0) {
    taskList.innerHTML = '<p class="no-tasks">No tasks logged for this date</p>'
    return
  }

  const taskItems = tasks
    .map((task) => {
      const timeString = formatTime(task.hours, task.minutes)
      const orgInfo = task.workItem?.organization ? `${task.workItem.organization} - ` : ""
      const projectInfo = task.workItem?.project ? `${task.workItem.project} - ` : ""
      const workItemType = task.workItem?.type ? `[${task.workItem.type}] ` : ""
      return `<div class="task-item">${orgInfo}${projectInfo}${workItemType}${task.task} - ${timeString}</div>`
    })
    .join("")

  taskList.innerHTML = taskItems
}

function displayDailyTotal(tasks) {
  const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0)
  const totalMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0)
  const totalTimeString = formatTime(totalHours, totalMinutes)
  document.getElementById("dailyTotal").textContent = `Total: ${totalTimeString}`
}

function formatTime(hours, minutes) {
  return `${hours}h ${minutes}m`
}

function showMessage(message, type) {
  // Remove existing messages
  const existingMessage = document.querySelector(".success-message, .error-message")
  if (existingMessage) {
    existingMessage.remove()
  }

  // Create new message
  const messageDiv = document.createElement("div")
  messageDiv.className = type === "success" ? "success-message" : "error-message"
  messageDiv.textContent = message

  // Insert at the top of the add task section
  const addTaskSection = document.querySelector(".add-task-section")
  addTaskSection.insertBefore(messageDiv, addTaskSection.firstChild.nextSibling)

  // Remove message after 3 seconds
  setTimeout(() => {
    messageDiv.remove()
  }, 3000)
}

async function initializeAzureDevOpsSettings() {
  // Load saved PAT settings
  const result = await window.chrome.storage.local.get(["adoSettings"])
  const settings = result.adoSettings || {}

  if (settings.pat && settings.expiresAt) {
    const expiryDate = new Date(settings.expiresAt)
    const now = new Date()

    if (expiryDate > now) {
      // PAT is valid
      showPATStatus(true, expiryDate)
      updateSettingsSummary(expiryDate)
      disablePATInputs()
      document.getElementById("pat").value = settings.pat
      loadOrganizations()
      await autoPopulateOrganization()
    } else {
      // PAT is expired
      showPATStatus(false, expiryDate)
      updateSettingsSummary(expiryDate)
    }
    document.getElementById("expiryDate").value = expiryDate.toISOString().split("T")[0]
  }

  // Event listeners for settings
  document.getElementById("togglePat").addEventListener("click", togglePATVisibility)
  document.getElementById("savePat").addEventListener("click", savePATSettings)
  document.getElementById("replacePat").addEventListener("click", enablePATInputs)
  document.getElementById("clearPat").addEventListener("click", clearPATSettings)
}

function showPATStatus(isValid, expiryDate) {
  const patStatus = document.getElementById("patStatus")
  patStatus.textContent = isValid ? "Valid" : "Expired"
  patStatus.style.color = isValid ? "green" : "red"
}

function updateSettingsSummary(expiryDate) {
  const settingsSummary = document.getElementById("settingsSummary")
  settingsSummary.textContent = `Settings - PAT expires on ${expiryDate.toISOString().split("T")[0]}`
}

async function autoPopulateOrganization() {
  const result = await window.chrome.storage.local.get(["adoSettings"])
  const settings = result.adoSettings || {}

  if (settings.organization && settings.pat) {
    const expiryDate = new Date(settings.expiresAt)
    const now = new Date()

    if (expiryDate > now) {
      const orgInput = document.getElementById("organizationInput")
      orgInput.value = settings.organization

      // Trigger input event to load projects
      setTimeout(() => {
        orgInput.dispatchEvent(new Event("input"))
      }, 500)
    }
  }
}

async function loadOrganizations() {
  const settings = await getADOSettings()
  if (!settings.pat) return

  document.getElementById("orgLoading").style.display = "block"

  try {
    const response = await fetch(`https://app.vssps.visualstudio.com/_apis/accounts?api-version=7.0`, {
      headers: getAuthHeaders(settings.pat),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    populateOrganizationDropdowns(data.value)
  } catch (error) {
    console.error("Error loading organizations:", error)
    showMessage("Failed to load organizations. Check your PAT.", "error")
  } finally {
    document.getElementById("orgLoading").style.display = "none"
  }
}

function populateOrganizationDropdowns(organizations) {
  const orgSelectors = ["organizationSelector", "viewOrgSelector"]
  orgSelectors.forEach((selectorId) => {
    const selector = document.getElementById(selectorId)
    const isViewSelector = selectorId === "viewOrgSelector"
    selector.innerHTML = isViewSelector
      ? '<option value="">All organizations</option>'
      : '<option value="">Select organization...</option>'

    organizations.forEach((org) => {
      const option = document.createElement("option")
      option.value = org.accountName
      option.textContent = org.accountName
      selector.appendChild(option)
    })
  })
}

function togglePATVisibility() {
  const patInput = document.getElementById("pat")
  const toggleBtn = document.getElementById("togglePat")

  if (patInput.type === "password") {
    patInput.type = "text"
    toggleBtn.textContent = "🙈"
  } else {
    patInput.type = "password"
    toggleBtn.textContent = "👁"
  }
}

async function savePATSettings() {
  const pat = document.getElementById("pat").value.trim()
  const expiryDate = document.getElementById("expiryDate").value
  const organization = document.getElementById("organization").value.trim()

  if (!pat || !expiryDate) {
    showMessage("Please fill in all fields", "error")
    return
  }

  const settings = {
    pat: pat,
    expiresAt: new Date(expiryDate).toISOString(),
    organization: organization,
  }

  try {
    await window.chrome.storage.local.set({ adoSettings: settings })
    showPATStatus(true, new Date(expiryDate))
    updateSettingsSummary(new Date(expiryDate))
    disablePATInputs()
    document.getElementById("pat").value = pat
    loadOrganizations()
    await autoPopulateOrganization()
    showMessage("Settings saved successfully!", "success")
  } catch (error) {
    console.error("Error saving settings:", error)
    showMessage("Error saving settings", "error")
  }
}

function enablePATInputs() {
  document.getElementById("pat").disabled = false
  document.getElementById("expiryDate").disabled = false
  document.getElementById("savePat").style.display = "inline-block"
  document.getElementById("replacePat").style.display = "none"
  document.getElementById("patStatus").style.display = "none"
}

function disablePATInputs() {
  document.getElementById("pat").disabled = true
  document.getElementById("expiryDate").disabled = true
  document.getElementById("savePat").style.display = "none"
  document.getElementById("replacePat").style.display = "inline-block"
  document.getElementById("patStatus").style.display = "inline-block"
}

async function clearPATSettings() {
  await window.chrome.storage.local.remove(["adoSettings"])
  document.getElementById("pat").value = ""
  document.getElementById("expiryDate").value = ""
  document.getElementById("organization").value = ""
  document.getElementById("organizationInput").value = ""
  document.getElementById("patStatus").style.display = "none"
  document.getElementById("settingsSummary").textContent = "Settings"
  enablePATInputs()
  const orgSelectors = ["viewOrgSelector"]
  orgSelectors.forEach((selectorId) => {
    const selector = document.getElementById(selectorId)
    selector.innerHTML = '<option value="">All organizations</option>'
  })
  document.getElementById("projectSelector").innerHTML = '<option value="">Select project...</option>'
  document.getElementById("workItemSelector").innerHTML =
    '<option value="">Select work item...</option><optgroup label="My Work Items" id="addTaskWorkItemsGroup"></optgroup><optgroup label="My Backlog" id="addTaskBacklogGroup"></optgroup>'
  showViewProjectSelector(false)
  showViewWorkItemSelector(false)
  showMessage("Settings cleared", "success")
}

async function getADOSettings() {
  const result = await window.chrome.storage.local.get(["adoSettings"])
  return result.adoSettings || {}
}

function getAuthHeaders(pat) {
  return {
    Authorization: `Basic ${btoa(":" + pat)}`,
    Accept: "application/json",
  }
}

async function loadProjectsForAddTask(org) {
  const settings = await getADOSettings()
  if (!settings.pat) return

  showProjectLoading(true)

  try {
    const response = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.0`, {
      headers: getAuthHeaders(settings.pat),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    populateProjectsForAddTask(data.value)
  } catch (error) {
    console.error("Error loading projects for add task:", error)
    showMessage("Failed to load projects. Check your settings.", "error")
  } finally {
    showProjectLoading(false)
  }
}

function showProjectLoading(show) {
  document.getElementById("projectLoading").style.display = show ? "block" : "none"
}

async function loadWorkItemsForAddTask(org, projectId) {
  const settings = await getADOSettings()
  if (!settings.pat) return

  showWorkItemLoading(true)
  clearWorkItemError()

  try {
    // Load work items assigned to me
    await loadWorkItemsForAddTaskForm(settings, org, projectId)
    // Load backlog items
    await loadBacklogItemsForAddTaskForm(settings, org, projectId)
  } catch (error) {
    console.error("Error loading work items for add task:", error)
    showWorkItemError("Failed to load work items")
  } finally {
    showWorkItemLoading(false)
  }
}

function showWorkItemLoading(show) {
  document.getElementById("workItemLoading").style.display = show ? "block" : "none"
}

function showWorkItemError(message) {
  const errorDiv = document.getElementById("workItemError")
  errorDiv.textContent = message
  errorDiv.style.display = "block"
}

function clearWorkItemError() {
  document.getElementById("workItemError").style.display = "none"
}

async function loadWorkItemsForAddTaskForm(settings, org, projectId) {
  const wiqlQuery = {
    query:
      "SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC",
  }

  const wiqlResponse = await fetch(`https://dev.azure.com/${org}/${projectId}/_apis/wit/wiql?api-version=7.0`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(settings.pat),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wiqlQuery),
  })

  if (!wiqlResponse.ok) {
    throw new Error(`WIQL query failed: ${wiqlResponse.status}`)
  }

  const wiqlData = await wiqlResponse.json()
  const workItemIds = wiqlData.workItems.map((wi) => wi.id).slice(0, 50)

  if (workItemIds.length > 0) {
    const detailsResponse = await fetch(
      `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${workItemIds.join(",")}&api-version=7.0`,
      {
        headers: getAuthHeaders(settings.pat),
      },
    )

    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json()
      populateWorkItemsForAddTask(detailsData.value)
    }
  } else {
    clearWorkItemsForAddTask()
  }
}

async function loadBacklogItemsForAddTaskForm(settings, org, projectId) {
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.WorkItemType] IN ('Product Backlog Item','User Story','Feature') AND [System.State] <> 'Done' AND [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC`,
  }

  const wiqlResponse = await fetch(`https://dev.azure.com/${org}/${projectId}/_apis/wit/wiql?api-version=7.0`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(settings.pat),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wiqlQuery),
  })

  if (!wiqlResponse.ok) {
    throw new Error(`Backlog WIQL query failed: ${wiqlResponse.status}`)
  }

  const wiqlData = await wiqlResponse.json()
  const backlogIds = wiqlData.workItems.map((wi) => wi.id).slice(0, 50)

  if (backlogIds.length > 0) {
    const detailsResponse = await fetch(
      `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${backlogIds.join(",")}&api-version=7.0`,
      {
        headers: getAuthHeaders(settings.pat),
      },
    )

    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json()
      populateBacklogItemsForAddTask(detailsData.value)
    }
  } else {
    clearBacklogItemsForAddTask()
  }
}

function populateWorkItemsForAddTask(workItems) {
  const workItemsGroup = document.getElementById("addTaskWorkItemsGroup")
  workItemsGroup.innerHTML = ""

  workItems.forEach((wi) => {
    const option = document.createElement("option")
    option.value = `wi:${wi.id}`
    option.textContent = `${wi.fields["System.Title"]} - ${wi.fields["System.WorkItemType"]}`
    workItemsGroup.appendChild(option)
  })
}

function populateBacklogItemsForAddTask(backlogItems) {
  const backlogGroup = document.getElementById("addTaskBacklogGroup")
  backlogGroup.innerHTML = ""

  backlogItems.forEach((item) => {
    const option = document.createElement("option")
    option.value = `backlog:${item.id}`
    option.textContent = `${item.fields["System.Title"]} - ${item.fields["System.WorkItemType"]}`
    backlogGroup.appendChild(option)
  })
}

function clearWorkItemsForAddTask() {
  document.getElementById("addTaskWorkItemsGroup").innerHTML = ""
}

function clearBacklogItemsForAddTask() {
  document.getElementById("addTaskBacklogGroup").innerHTML = ""
}

async function loadProjectsForView(org) {
  const settings = await getADOSettings()
  if (!settings.pat) return

  showViewProjectLoading(true)

  try {
    const response = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.0`, {
      headers: getAuthHeaders(settings.pat),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    populateProjectsForView(data.value)
  } catch (error) {
    console.error("Error loading projects for view:", error)
    showMessage("Failed to load projects. Check your settings.", "error")
  } finally {
    showViewProjectLoading(false)
  }
}

function showViewProjectLoading(show) {
  document.getElementById("viewProjectLoading").style.display = show ? "block" : "none"
}

async function loadWorkItemsForView(org, projectId) {
  const settings = await getADOSettings()
  if (!settings.pat) return

  showViewWorkItemLoading(true)
  clearViewWorkItemError()

  try {
    await loadWorkItemsForViewForm(settings, org, projectId)
    await loadBacklogItemsForViewForm(settings, org, projectId)
  } catch (error) {
    console.error("Error loading work items for view:", error)
    showViewWorkItemError("Failed to load work items")
  } finally {
    showViewWorkItemLoading(false)
  }
}

function showViewWorkItemLoading(show) {
  document.getElementById("viewWorkItemLoading").style.display = show ? "block" : "none"
}

function showViewWorkItemError(message) {
  const errorDiv = document.getElementById("viewWorkItemError")
  errorDiv.textContent = message
  errorDiv.style.display = "block"
}

function clearViewWorkItemError() {
  document.getElementById("viewWorkItemError").style.display = "none"
}

async function loadWorkItemsForViewForm(settings, org, projectId) {
  const wiqlQuery = {
    query:
      "SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC",
  }

  const wiqlResponse = await fetch(`https://dev.azure.com/${org}/${projectId}/_apis/wit/wiql?api-version=7.0`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(settings.pat),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wiqlQuery),
  })

  if (!wiqlResponse.ok) {
    throw new Error(`WIQL query failed: ${wiqlResponse.status}`)
  }

  const wiqlData = await wiqlResponse.json()
  const workItemIds = wiqlData.workItems.map((wi) => wi.id).slice(0, 50)

  if (workItemIds.length > 0) {
    const detailsResponse = await fetch(
      `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${workItemIds.join(",")}&api-version=7.0`,
      {
        headers: getAuthHeaders(settings.pat),
      },
    )

    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json()
      populateWorkItemsForView(detailsData.value)
    }
  } else {
    clearWorkItemsForView()
  }
}

async function loadBacklogItemsForViewForm(settings, org, projectId) {
  const wiqlQuery = {
    query: `SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.WorkItemType] IN ('Product Backlog Item','User Story','Feature') AND [System.State] <> 'Done' AND [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC`,
  }

  const wiqlResponse = await fetch(`https://dev.azure.com/${org}/${projectId}/_apis/wit/wiql?api-version=7.0`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(settings.pat),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(wiqlQuery),
  })

  if (!wiqlResponse.ok) {
    throw new Error(`Backlog WIQL query failed: ${wiqlResponse.status}`)
  }

  const wiqlData = await wiqlResponse.json()
  const backlogIds = wiqlData.workItems.map((wi) => wi.id).slice(0, 50)

  if (backlogIds.length > 0) {
    const detailsResponse = await fetch(
      `https://dev.azure.com/${org}/_apis/wit/workitems?ids=${backlogIds.join(",")}&api-version=7.0`,
      {
        headers: getAuthHeaders(settings.pat),
      },
    )

    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json()
      populateBacklogItemsForView(detailsData.value)
    }
  } else {
    clearBacklogItemsForView()
  }
}

function populateWorkItemsForView(workItems) {
  const workItemsGroup = document.getElementById("viewWorkItemsGroup")
  workItemsGroup.innerHTML = ""

  workItems.forEach((wi) => {
    const option = document.createElement("option")
    option.value = `wi:${wi.id}`
    option.textContent = `${wi.fields["System.Title"]} - ${wi.fields["System.WorkItemType"]}`
    workItemsGroup.appendChild(option)
  })
}

function populateBacklogItemsForView(backlogItems) {
  const backlogGroup = document.getElementById("viewBacklogGroup")
  backlogGroup.innerHTML = ""

  backlogItems.forEach((item) => {
    const option = document.createElement("option")
    option.value = `backlog:${item.id}`
    option.textContent = `${item.fields["System.Title"]} - ${item.fields["System.WorkItemType"]}`
    backlogGroup.appendChild(option)
  })
}

function clearWorkItemsForView() {
  document.getElementById("viewWorkItemsGroup").innerHTML = ""
}

function clearBacklogItemsForView() {
  document.getElementById("viewBacklogGroup").innerHTML = ""
}

function populateProjectsForAddTask(projects) {
  const projectSelector = document.getElementById("projectSelector")
  projectSelector.innerHTML = '<option value="">Select project...</option>'

  projects.forEach((project) => {
    const option = document.createElement("option")
    option.value = project.id
    option.textContent = project.name
    projectSelector.appendChild(option)
  })
}

function populateProjectsForView(projects) {
  const viewProjectSelector = document.getElementById("viewProjectSelector")
  viewProjectSelector.innerHTML = '<option value="">Select project...</option>'

  projects.forEach((project) => {
    const option = document.createElement("option")
    option.value = project.id
    option.textContent = project.name
    viewProjectSelector.appendChild(option)
  })
}

// Function to check for current work item and pre-select if applicable
async function checkAndPreSelectWorkItem() {
  try {
    console.log("[v0] Starting checkAndPreSelectWorkItem...")

    // First check if we have chrome.runtime available
    const chrome = window.chrome
    if (!chrome || !chrome.runtime) {
      console.log("[v0] Chrome runtime not available")
      return
    }

    // Get current work item from background script
    console.log("[v0] Requesting current work item from background...")
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GET_CURRENT_WORK_ITEM" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("[v0] Runtime error:", chrome.runtime.lastError)
          reject(chrome.runtime.lastError)
        } else {
          console.log("[v0] Background response:", response)
          resolve(response)
        }
      })
    })

    console.log("[v0] Current work item from background:", response)

    if (response && response.id) {
      console.log("[v0] Found work item to pre-select:", response)
      setTimeout(async () => {
        try {
          await preSelectWorkItem(response)
        } catch (error) {
          console.error("[v0] Error in preSelectWorkItem:", error)
        }
      }, 1000)
    } else {
      console.log("[v0] No current work item found or invalid data")
    }
  } catch (error) {
    console.error("[v0] Error checking current work item:", error)
  }
}

async function preSelectWorkItem(workItem) {
  try {
    console.log("[v0] Starting preSelectWorkItem with:", workItem)

    const settings = await getADOSettings()
    if (!settings.pat) {
      console.log("[v0] No PAT configured, cannot pre-select work item")
      showMessage("PAT not configured - cannot auto-select work item", "error")
      return
    }

    console.log("[v0] PAT is configured, proceeding with pre-selection")

    if (!workItem.organization || !workItem.project || !workItem.id) {
      console.log("[v0] Incomplete work item data:", workItem)
      showMessage("Incomplete work item data for auto-selection", "error")
      return
    }

    const orgInput = document.getElementById("organizationInput")
    orgInput.value = workItem.organization
    console.log("[v0] Set organization to:", workItem.organization)

    // Trigger organization change to load projects
    showProjectSelector(true)
    console.log("[v0] Loading projects for organization:", workItem.organization)

    try {
      await loadProjectsForAddTask(workItem.organization)
      console.log("[v0] Projects loaded successfully")
    } catch (error) {
      console.error("[v0] Error loading projects:", error)
      showMessage("Error loading projects for auto-selection", "error")
      return
    }

    setTimeout(async () => {
      try {
        const projectSelector = document.getElementById("projectSelector")
        let projectFound = false
        let projectId = null

        console.log("[v0] Looking for project:", workItem.project)
        console.log(
          "[v0] Available projects:",
          Array.from(projectSelector.options).map((o) => ({ value: o.value, text: o.textContent })),
        )

        for (const option of projectSelector.options) {
          if (
            option.textContent === workItem.project ||
            option.textContent.toLowerCase() === workItem.project.toLowerCase() ||
            option.textContent.includes(workItem.project) ||
            workItem.project.includes(option.textContent)
          ) {
            projectSelector.value = option.value
            projectId = option.value
            projectFound = true
            console.log("[v0] Found and selected project:", option.textContent, "with ID:", option.value)
            break
          }
        }

        if (!projectFound) {
          console.log("[v0] Project not found in available projects:", workItem.project)
          showMessage(`Project "${workItem.project}" not found or not accessible`, "error")
          return
        }

        const projectChangeEvent = new Event("change", { bubbles: true })
        projectSelector.dispatchEvent(projectChangeEvent)
        showWorkItemSelector(true)

        console.log("[v0] Loading work items for project:", projectId)

        try {
          await loadWorkItemsForAddTask(workItem.organization, projectId)
          console.log("[v0] Work items loaded successfully")
        } catch (error) {
          console.error("[v0] Error loading work items:", error)
          showMessage("Error loading work items for auto-selection", "error")
          return
        }

        setTimeout(() => {
          try {
            const workItemSelector = document.getElementById("workItemSelector")
            let workItemFound = false

            console.log("[v0] Looking for work item ID:", workItem.id)
            console.log(
              "[v0] Available work items:",
              Array.from(workItemSelector.options).map((o) => ({ value: o.value, text: o.textContent })),
            )

            // Look for the work item in both work items and backlog items
            for (const option of workItemSelector.options) {
              if (option.value === `wi:${workItem.id}` || option.value === `backlog:${workItem.id}`) {
                workItemSelector.value = option.value
                workItemFound = true
                console.log("[v0] Pre-selected work item:", option.textContent)

                const workItemTitle = workItem.title || `Work Item ${workItem.id}`
                showMessage(`Auto-selected: ${workItemTitle}`, "success")
                break
              }
            }

            if (!workItemFound) {
              console.log("[v0] Work item not found in assigned items - may not be assigned to current user")
              console.log("[v0] Searched for values: wi:" + workItem.id + " and backlog:" + workItem.id)
              showMessage(`Work item ${workItem.id} is not assigned to you or not accessible`, "error")
            }
          } catch (error) {
            console.error("[v0] Error in work item selection:", error)
          }
        }, 4000) // Increased to 4 seconds
      } catch (error) {
        console.error("[v0] Error in project selection:", error)
      }
    }, 3500) // Increased to 3.5 seconds
  } catch (error) {
    console.error("[v0] Error pre-selecting work item:", error)
    showMessage("Error auto-selecting work item", "error")
  }
}
