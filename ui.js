// ui.js

function showMessage(message, type) {
  const existingMessage = document.querySelector(".success-message, .error-message");
  if (existingMessage) {
    existingMessage.remove();
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = type === "success" ? "success-message" : "error-message";
  messageDiv.textContent = message;

  const addTaskSection = document.querySelector(".add-task-section");
  addTaskSection.insertBefore(messageDiv, addTaskSection.firstChild.nextSibling);

  setTimeout(() => {
    messageDiv.remove();
  }, 3000);
}

function formatTime(hours, minutes) {
    const totalMinutes = hours * 60 + minutes;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
}

function displayDailyTotal(tasks) {
  const totalMinutes = tasks.reduce((sum, task) => sum + (task.hours * 60) + task.minutes, 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const totalTimeString = formatTime(hours, minutes);
  document.getElementById("dailyTotal").textContent = `Total: ${totalTimeString}`;
}

function displayTasks(tasks) {
  const taskList = document.getElementById("taskList");

  if (tasks.length === 0) {
    taskList.innerHTML = '<p class="no-tasks">No tasks logged for this date</p>';
    return;
  }

  const taskItems = tasks
    .map((task) => {
      const timeString = formatTime(task.hours, task.minutes);
      const orgInfo = task.workItem?.organization ? `${task.workItem.organization} - ` : "";
      const projectInfo = task.workItem?.project ? `${task.workItem.project} - ` : "";
      const workItemType = task.workItem?.type ? `[${task.workItem.type}] ` : "";
      return `<div class="task-item">${orgInfo}${projectInfo}${workItemType}${task.task} - ${timeString}</div>`;
    })
    .join("");

  taskList.innerHTML = taskItems;
}

function togglePATVisibility() {
  const patInput = document.getElementById("pat");
  const toggleBtn = document.getElementById("togglePat");

  if (patInput.type === "password") {
    patInput.type = "text";
    toggleBtn.textContent = "🙈";
  } else {
    patInput.type = "password";
    toggleBtn.textContent = "👁";
  }
}

function showLoading(elementId, show) {
  document.getElementById(elementId).style.display = show ? "block" : "none";
}