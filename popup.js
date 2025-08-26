document.addEventListener("DOMContentLoaded", async () => {
  console.log("[v0] Popup DOM loaded, initializing...");

  const today = new Date().toISOString().split("T")[0];
  
  document.getElementById("taskDate").setAttribute('max', today);
  document.getElementById("filterDate").setAttribute('max', today);

  document.getElementById("taskDate").value = today;
  document.getElementById("filterDate").value = today;

  await loadTasksForDate(today);
  await initializeAzureDevOpsSettings();

  // --- EVENT LISTENERS ---
  
  document.getElementById("addTaskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    addTask();
  });

  // Settings Panel
  document.getElementById("addOrgForm").addEventListener("submit", handleAddOrganization);
  document.getElementById("clearAllSettingsBtn").addEventListener("click", clearAllSettings);
  document.getElementById("orgPatList").addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-org-btn")) {
        handleDeleteOrganization(e.target.dataset.org);
    }
  });
  document.getElementById("toggleNewPat").addEventListener("click", () => {
    const patInput = document.getElementById("newPat");
    const toggleBtn = document.getElementById("toggleNewPat");
    patInput.type = patInput.type === "password" ? "text" : "password";
    toggleBtn.textContent = patInput.type === "password" ? "👁" : "🙈";
  });

  // View Logs Filters
  document.getElementById("filterDate").addEventListener("change", (e) => loadTasksForDate(e.target.value));
  document.getElementById("viewOrgSelector").addEventListener("change", (e) => {
    const org = e.target.value;
    showViewProjectSelector(!!org);
    if(org) loadProjectsForView(org);
    applyFilters();
  });
  document.getElementById("viewProjectSelector").addEventListener("change", (e) => {
    const projectId = e.target.value;
    const org = document.getElementById("viewOrgSelector").value;
    showViewWorkItemSelector(!!projectId && !!org);
    if (projectId && org) loadWorkItemsForView(org, projectId);
    applyFilters();
  });
  document.getElementById("viewWorkItemSelector").addEventListener("change", applyFilters);
  
  // Task List Actions (Edit/Delete)
  document.getElementById("taskList").addEventListener("click", handleTaskListActions);
  
  // Add Task Dropdowns
  document.getElementById("organizationSelect").addEventListener("change", (e) => {
    const org = e.target.value;
    showProjectSelector(!!org);
    if(org) loadProjectsForAddTask(org);
  });
  document.getElementById("projectSelector").addEventListener("change", (e) => {
    const projectId = e.target.value;
    const org = document.getElementById("organizationSelect").value;
    showWorkItemSelector(!!projectId && !!org);
    if(projectId && org) loadWorkItemsForAddTask(org, projectId);
  });
  
  // Retry Button
  document.getElementById("retryButton").addEventListener("click", handleRetryClick);

  await checkAndPreSelectWorkItem();
});

// --- Settings Logic (FIXED) ---

async function initializeAzureDevOpsSettings() {
    await refreshSettingsUI();
}

async function refreshSettingsUI() {
    await renderOrgPatList();
    await populateOrganizationDropdowns();
}

async function renderOrgPatList() {
    const settings = await getADOSettings();
    const listDiv = document.getElementById("orgPatList");
    if (settings.length === 0) {
        listDiv.innerHTML = '<p class="no-orgs-message">No organizations saved.</p>';
        return;
    }
    listDiv.innerHTML = settings.map(s => `
        <div class="org-pat-item">
            <span class="org-pat-item-name">${s.organization}</span>
            <button class="delete-org-btn" data-org="${s.organization}" title="Delete">&times;</button>
        </div>
    `).join("");
}

async function handleAddOrganization(e) {
    e.preventDefault(); // Prevents the form from submitting
    e.stopPropagation(); // Prevents the event from bubbling up

    try {
        const orgNameInput = document.getElementById("newOrganization");
        const patInput = document.getElementById("newPat");
        const expiryDateInput = document.getElementById("newExpiryDate");

        const orgName = orgNameInput.value.trim();
        const pat = patInput.value.trim();
        const expiryDate = expiryDateInput.value;

        if (!orgName || !pat || !expiryDate) {
            showMessage("All fields are required.", "error");
            return;
        }

        const settings = await getADOSettings();
        if (settings.some(s => s.organization.toLowerCase() === orgName.toLowerCase())) {
            showMessage("This organization is already saved.", "error");
            return;
        }

        settings.push({
            organization: orgName,
            pat: pat,
            expiresAt: new Date(expiryDate).toISOString()
        });

        await saveADOSettings(settings);
        showMessage("Organization saved successfully!", "success");
        
        document.getElementById("addOrgForm").reset();
        await refreshSettingsUI();
    } catch (error) {
        console.error("Failed to add organization:", error);
        showMessage("An error occurred while saving the organization.", "error");
    }
}


async function handleDeleteOrganization(orgNameToDelete) {
    if (!confirm(`Are you sure you want to delete the settings for ${orgNameToDelete}?`)) return;
    try {
        let settings = await getADOSettings();
        settings = settings.filter(s => s.organization !== orgNameToDelete);
        await saveADOSettings(settings);
        showMessage("Organization deleted.", "success");
        await refreshSettingsUI();
    } catch (error) {
        console.error("Failed to delete organization:", error);
        showMessage("An error occurred while deleting the organization.", "error");
    }
}

async function clearAllSettings() {
    if (!confirm("Are you sure you want to delete ALL saved settings?")) return;
    try {
        await clearADOSettings();
        showMessage("All settings cleared.", "success");
        await refreshSettingsUI();
    } catch (error) {
        console.error("Failed to clear settings:", error);
        showMessage("An error occurred while clearing settings.", "error");
    }
}

// --- The rest of the file remains unchanged ---
async function addTask() {
  const date = document.getElementById("taskDate").value;
  const description = document.getElementById("taskDescription").value.trim();
  const hours = Number.parseInt(document.getElementById("hours").value) || 0;
  const minutes = Number.parseInt(document.getElementById("minutes").value) || 0;
  
  const organizationSelect = document.getElementById("organizationSelect");
  const projectSelector = document.getElementById("projectSelector");
  const workItemSelector = document.getElementById("workItemSelector");
  
  const selectedOrg = organizationSelect.value;

  if (!date || !selectedOrg || !projectSelector.value || !workItemSelector.value || (hours === 0 && minutes === 0)) {
    showMessage("Please fill in all required fields and enter a time.", "error");
    return;
  }

  try {
    const existingTasks = await getTasksForDate(date);
    const loggedMinutes = existingTasks.reduce((total, task) => total + (task.hours * 60) + task.minutes, 0);
    const newMinutes = (hours * 60) + minutes;
    const totalMinutesLimit = 8 * 60;

    if (loggedMinutes + newMinutes > totalMinutesLimit) {
      const remainingMinutes = totalMinutesLimit - loggedMinutes;
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      showMessage(remainingMinutes <= 0 ? "You have already logged 8 hours for this day." : `Exceeds 8-hour limit. You can only log ${remainingHours}h ${remainingMins}m more.`, "error");
      return;
    }

    const selectedWorkItem = workItemSelector.value;
    const selectedWorkItemText = workItemSelector.options[workItemSelector.selectedIndex].text;
    let workItemInfo = {};
    if (selectedWorkItem.startsWith("wi:") || selectedWorkItem.startsWith("backlog:")) {
      const workItemId = selectedWorkItem.split(":")[1];
      const [title, type] = selectedWorkItemText.split(" - ");
      workItemInfo = {
        id: workItemId,
        title: title,
        type: type,
        organization: selectedOrg,
        project: projectSelector.options[projectSelector.selectedIndex].text,
        projectId: projectSelector.value,
      };
    }

    const newTask = {
      task: workItemInfo.title || selectedWorkItemText,
      description: description,
      workItem: workItemInfo,
      hours: hours,
      minutes: minutes,
      timestamp: new Date().toISOString(),
    };
    existingTasks.push(newTask);
    await saveTasksForDate(date, existingTasks);

    document.getElementById("hours").value = "0";
    document.getElementById("minutes").value = "0";
    document.getElementById("taskDescription").value = "";
    document.getElementById("workItemSelector").value = "";

    showMessage("Time log added successfully!", "success");

    if (document.getElementById("filterDate").value === date) {
      loadTasksForDate(date);
    }
  } catch (error) {
    console.error("Error saving task:", error);
    showMessage("Error saving task. Please try again.", "error");
  }
}

async function getPatForOrg(org) {
    const settings = await getADOSettings();
    const orgSetting = settings.find(s => s.organization === org);
    return orgSetting ? orgSetting.pat : null;
}


async function loadProjectsForAddTask(org) {
    const pat = await getPatForOrg(org);
    if (!pat) {
        showMessage(`PAT for ${org} not found in settings.`, "error");
        return;
    }
    showLoading("projectLoading", true);
    try {
        const data = await fetchProjects(pat, org);
        populateProjectsForAddTask(data.value);
    } catch (error) {
        showMessage("Failed to load projects.", "error");
    } finally {
        showLoading("projectLoading", false);
    }
}

async function loadWorkItemsForAddTask(org, projectId) {
    const pat = await getPatForOrg(org);
    if (!pat) {
        showMessage(`PAT for ${org} not found in settings.`, "error");
        return;
    }
    showLoading("workItemLoading", true);
    try {
        const workItemsQuery = "SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC";
        const backlogQuery = `SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.WorkItemType] IN ('Product Backlog Item','User Story','Feature') AND [System.State] <> 'Done' AND [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC`;
        const [workItemsData, backlogData] = await Promise.all([
            fetchWorkItems(pat, org, projectId, workItemsQuery),
            fetchWorkItems(pat, org, projectId, backlogQuery),
        ]);
        populateWorkItemsForAddTask(workItemsData.value);
        populateBacklogItemsForAddTask(backlogData.value);
    } catch (error) {
        showMessage("Failed to load work items.", "error");
    } finally {
        showLoading("workItemLoading", false);
    }
}

async function loadProjectsForView(org) {
    const pat = await getPatForOrg(org);
    if (!pat) {
        showMessage(`PAT for ${org} not found in settings.`, "error");
        return;
    }
    showLoading("viewProjectLoading", true);
    try {
        const data = await fetchProjects(pat, org);
        populateProjectsForView(data.value);
    } catch (error) {
        showMessage("Failed to load projects.", "error");
    } finally {
        showLoading("viewProjectLoading", false);
    }
}

async function loadWorkItemsForView(org, projectId) {
    const pat = await getPatForOrg(org);
    if (!pat) {
        showMessage(`PAT for ${org} not found in settings.`, "error");
        return;
    }
    showLoading("viewWorkItemLoading", true);
    try {
        const workItemsQuery = "SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC";
        const backlogQuery = `SELECT [System.Id], [System.WorkItemType] FROM WorkItems WHERE [System.WorkItemType] IN ('Product Backlog Item','User Story','Feature') AND [System.State] <> 'Done' AND [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC`;
        const [workItemsData, backlogData] = await Promise.all([
            fetchWorkItems(pat, org, projectId, workItemsQuery),
            fetchWorkItems(pat, org, projectId, backlogQuery),
        ]);
        populateWorkItemsForView(workItemsData.value);
        populateBacklogItemsForView(backlogData.value);
    } catch (error) {
        showMessage("Failed to load work items.", "error");
    } finally {
        showLoading("viewWorkItemLoading", false);
    }
}

async function loadTasksForDate(date) {
    if (!date) return;
  try {
    const tasks = await getTasksForDate(date);
    applyFiltersToTasks(tasks, date);
  } catch (error) {
    console.error("Error loading tasks:", error);
    showMessage("Error loading tasks.", "error");
  }
}

async function applyFilters() {
    const filterDate = document.getElementById("filterDate").value;
    if (filterDate) {
        const tasks = await getTasksForDate(filterDate);
        applyFiltersToTasks(tasks, filterDate);
    }
}

function applyFiltersToTasks(tasks, date) {
  const selectedOrg = document.getElementById("viewOrgSelector").value;
  const selectedProject = document.getElementById("viewProjectSelector").value;
  const selectedWorkItem = document.getElementById("viewWorkItemSelector").value;
  let filteredTasks = tasks;
  if (selectedOrg) filteredTasks = filteredTasks.filter((task) => task.workItem?.organization === selectedOrg);
  if (selectedProject) filteredTasks = filteredTasks.filter((task) => task.workItem?.projectId === selectedProject);
  if (selectedWorkItem) {
    const workItemId = parseInt(selectedWorkItem.split(":")[1], 10);
    filteredTasks = filteredTasks.filter((task) => task.workItem?.id == workItemId);
  }
  displayTasks(filteredTasks, date);
  displayDailyTotal(filteredTasks);
}

async function populateOrganizationDropdowns() {
    const settings = await getADOSettings();
    const orgs = settings.map(s => s.organization);
    
    const viewSelector = document.getElementById("viewOrgSelector");
    viewSelector.innerHTML = '<option value="">All organizations</option>';
    orgs.forEach(org => {
        const option = document.createElement("option");
        option.value = org;
        option.textContent = org;
        viewSelector.appendChild(option);
    });

    const addSelector = document.getElementById("organizationSelect");
    addSelector.innerHTML = '<option value="">Select organization...</option>';
    orgs.forEach(org => {
        const option = document.createElement("option");
        option.value = org;
        option.textContent = org;
        addSelector.appendChild(option);
    });
}

function displayTasks(tasks, date) {
  const taskList = document.getElementById("taskList");
  const today = new Date().toISOString().split("T")[0];
  const isToday = date === today;
  if (tasks.length === 0) {
    taskList.innerHTML = '<p class="no-tasks">No tasks logged for this date</p>';
    return;
  }
  taskList.innerHTML = tasks.map((task) => {
    const timeString = formatTime(task.hours, task.minutes);
    const orgInfo = task.workItem?.organization ? `${task.workItem.organization} - ` : "";
    const projectInfo = task.workItem?.project ? `${task.workItem.project} - ` : "";
    const workItemType = task.workItem?.type ? `[${task.workItem.type}] ` : "";
    const descriptionHTML = task.description ? `<div class="task-description">${task.description}</div>` : "";
    const actionButtons = isToday
      ? `<div class="task-actions">
           <button class="edit-btn" data-timestamp="${task.timestamp}" title="Edit">✏️</button>
           <button class="delete-btn" data-timestamp="${task.timestamp}" title="Delete">🗑️</button>
         </div>`
      : "";
    return `<div class="task-item" data-timestamp="${task.timestamp}">
              <div class="task-content">
                <div class="task-main-info">
                  <div class="task-details">${orgInfo}${projectInfo}${workItemType}${task.task}</div>
                  <div class="task-time" data-hours="${task.hours}" data-minutes="${task.minutes}">${timeString}</div>
                </div>
                ${descriptionHTML}
              </div>
              ${actionButtons}
            </div>`;
  }).join("");
}

function handleTaskListActions(e) {
    const target = e.target.closest('button');
    if (!target) return;
    const timestamp = target.dataset.timestamp;
    if (target.classList.contains("delete-btn")) handleDeleteTask(timestamp);
    else if (target.classList.contains("edit-btn")) handleEditTask(target);
    else if (target.classList.contains("save-edit-btn")) handleSaveEdit(target);
    else if (target.classList.contains("cancel-edit-btn")) handleCancelEdit();
}

async function handleDeleteTask(timestamp) {
    const date = document.getElementById("filterDate").value;
    if (!date || !confirm("Are you sure you want to delete this time log?")) return;
    try {
        let tasks = await getTasksForDate(date);
        tasks = tasks.filter(task => task.timestamp !== timestamp);
        await saveTasksForDate(date, tasks);
        await loadTasksForDate(date);
        showMessage("Time log deleted.", "success");
    } catch (error) {
        showMessage("Error deleting log.", "error");
    }
}

function handleEditTask(editButton) {
    const taskItem = editButton.closest('.task-item');
    taskItem.classList.add('edit-mode');
    const taskContent = taskItem.querySelector('.task-content');
    const { hours, minutes } = taskItem.querySelector('.task-time').dataset;
    const description = taskItem.querySelector('.task-description')?.textContent || '';
    const taskDetailsHTML = taskContent.querySelector('.task-main-info .task-details').innerHTML;
    taskContent.innerHTML = `
        <div class="task-details">${taskDetailsHTML}</div>
        <div class="edit-inputs">
            <span>
                <input type="number" class="edit-hours" value="${hours}" min="0" max="23">h
                <input type="number" class="edit-minutes" value="${minutes}" min="0" max="59">m
            </span>
        </div>
        <div class="edit-description">
            <textarea class="edit-desc-textarea" rows="2" placeholder="Edit description...">${description}</textarea>
        </div>
    `;
    const taskActions = taskItem.querySelector('.task-actions');
    taskActions.innerHTML = `
        <button class="save-edit-btn" data-timestamp="${taskItem.dataset.timestamp}" title="Save">💾</button>
        <button class="cancel-edit-btn" title="Cancel">❌</button>
    `;
}

async function handleSaveEdit(saveButton) {
    const date = document.getElementById("filterDate").value;
    const taskItem = saveButton.closest('.task-item');
    const timestampToEdit = taskItem.dataset.timestamp;
    const newHours = parseInt(taskItem.querySelector('.edit-hours').value, 10) || 0;
    const newMinutes = parseInt(taskItem.querySelector('.edit-minutes').value, 10) || 0;
    const newDescription = taskItem.querySelector('.edit-desc-textarea').value.trim();
    if ((newHours === 0 && newMinutes === 0)) {
        showMessage("Time cannot be zero.", "error");
        return;
    }
    try {
        const tasks = await getTasksForDate(date);
        const otherTasks = tasks.filter(t => t.timestamp !== timestampToEdit);
        const loggedMinutes = otherTasks.reduce((total, task) => total + (task.hours * 60) + task.minutes, 0);
        const newEntryMinutes = (newHours * 60) + newMinutes;
        const totalMinutesLimit = 8 * 60;
        if (loggedMinutes + newEntryMinutes > totalMinutesLimit) {
            showMessage("Editing this entry exceeds the 8-hour daily limit.", "error");
            return;
        }
        const taskToUpdate = tasks.find(t => t.timestamp === timestampToEdit);
        taskToUpdate.hours = newHours;
        taskToUpdate.minutes = newMinutes;
        taskToUpdate.description = newDescription;
        await saveTasksForDate(date, tasks);
        await loadTasksForDate(date);
        showMessage("Time log updated.", "success");
    } catch (error) {
        showMessage("Error saving log.", "error");
    }
}

async function handleCancelEdit() {
    await loadTasksForDate(document.getElementById("filterDate").value);
}

async function handleRetryClick() {
    console.log("[v0] Retry button clicked");
    const retryBtn = document.getElementById("retryButton");
    try {
        retryBtn.innerHTML = "⏳";
        retryBtn.disabled = true;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
            showMessage("Could not access current tab", "error");
            return;
        }
        const workItemMatch = tab.url.match(/https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/);
        if (!workItemMatch) {
            showMessage("Not on a work item page", "error");
            return;
        }
        const [, organization, project, workItemId] = workItemMatch;
        const workItemData = {
            organization: decodeURIComponent(organization),
            project: decodeURIComponent(project),
            id: Number.parseInt(workItemId),
        };
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "WORK_ITEM_DETECTED", workItem: workItemData },
                (response) => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(response)
            );
        });
        showMessage("Work item detected! Pre-selecting...", "success");
        await checkAndPreSelectWorkItem();
    } catch (error) {
        console.error("Error in retry button:", error);
        showMessage("Error detecting work item: " + error.message, "error");
    } finally {
        retryBtn.innerHTML = "🔄";
        retryBtn.disabled = false;
    }
}

async function checkAndPreSelectWorkItem() {
  try {
    const workItem = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GET_CURRENT_WORK_ITEM" }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
    if (workItem && workItem.id) {
      await preSelectWorkItem(workItem);
    }
  } catch (error) {
    console.error("Error checking current work item:", error);
  }
}

async function preSelectWorkItem(workItem) {
  try {
    if (!workItem.organization || !workItem.project || !workItem.id) return;
    
    const orgSelect = document.getElementById("organizationSelect");
    if ([...orgSelect.options].some(o => o.value === workItem.organization)) {
        orgSelect.value = workItem.organization;
        
        orgSelect.dispatchEvent(new Event('change'));

        setTimeout(async () => {
            const projectSelector = document.getElementById("projectSelector");
            let projectId;
            for (const option of projectSelector.options) {
                if (option.textContent.toLowerCase() === workItem.project.toLowerCase()) {
                    projectSelector.value = option.value;
                    projectId = option.value;
                    break;
                }
            }
            if (!projectId) return;

            projectSelector.dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                const workItemSelector = document.getElementById("workItemSelector");
                for (const option of workItemSelector.options) {
                    if (option.value.endsWith(`:${workItem.id}`)) {
                        workItemSelector.value = option.value;
                        showMessage(`Auto-selected: Work Item ${workItem.id}`, "success");
                        break;
                    }
                }
            }, 1000);
        }, 1000);
    } else {
        showMessage(`Org "${workItem.organization}" not in settings.`, "error");
    }
  } catch (error) {
    console.error("Error pre-selecting work item:", error);
    showMessage("Error auto-selecting work item", "error");
  }
}

function populateProjectsForAddTask(projects) {
  const projectSelector = document.getElementById("projectSelector");
  projectSelector.innerHTML = '<option value="">Select project...</option>';
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    projectSelector.appendChild(option);
  });
}
function populateProjectsForView(projects) {
  const viewProjectSelector = document.getElementById("viewProjectSelector");
  viewProjectSelector.innerHTML = '<option value="">All projects</option>';
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    viewProjectSelector.appendChild(option);
  });
}
function populateWorkItemsForAddTask(workItems) {
  const workItemsGroup = document.getElementById("addTaskWorkItemsGroup");
  workItemsGroup.innerHTML = "";
  workItems.forEach((wi) => {
    const option = document.createElement("option");
    option.value = `wi:${wi.id}`;
    option.textContent = `${wi.fields["System.Title"]} - ${wi.fields["System.WorkItemType"]}`;
    workItemsGroup.appendChild(option);
  });
}
function populateBacklogItemsForAddTask(backlogItems) {
  const backlogGroup = document.getElementById("addTaskBacklogGroup");
  backlogGroup.innerHTML = "";
  backlogItems.forEach((item) => {
    const option = document.createElement("option");
    option.value = `backlog:${item.id}`;
    option.textContent = `${item.fields["System.Title"]} - ${item.fields["System.WorkItemType"]}`;
    backlogGroup.appendChild(option);
  });
}
function populateWorkItemsForView(workItems) {
  const workItemsGroup = document.getElementById("viewWorkItemsGroup");
  workItemsGroup.innerHTML = "";
  workItems.forEach((wi) => {
    const option = document.createElement("option");
    option.value = `wi:${wi.id}`;
    option.textContent = `${wi.fields["System.Title"]} - ${wi.fields["System.WorkItemType"]}`;
    workItemsGroup.appendChild(option);
  });
}
function populateBacklogItemsForView(backlogItems) {
  const backlogGroup = document.getElementById("viewBacklogGroup");
  backlogGroup.innerHTML = "";
  backlogItems.forEach((item) => {
    const option = document.createElement("option");
    option.value = `backlog:${item.id}`;
    option.textContent = `${item.fields["System.Title"]} - ${item.fields["System.WorkItemType"]}`;
    backlogGroup.appendChild(option);
  });
}
function showProjectSelector(show) { document.getElementById("projectSelectorGroup").style.display = show ? "block" : "none"; }
function showWorkItemSelector(show) { document.getElementById("workItemSelectorGroup").style.display = show ? "block" : "none"; }
function showViewProjectSelector(show) { document.getElementById("viewProjectSelectorGroup").style.display = show ? "block" : "none"; }
function showViewWorkItemSelector(show) { document.getElementById("viewWorkItemSelectorGroup").style.display = show ? "block" : "none"; }