// storage.js

async function getADOSettings() {
  const result = await chrome.storage.local.get(["adoSettings"]);
  return result.adoSettings || []; // Default to an empty array
}

async function saveADOSettings(settings) {
  await chrome.storage.local.set({ adoSettings: settings });
}

async function clearADOSettings() {
  await chrome.storage.local.remove(["adoSettings"]);
}

async function getTasksForDate(date) {
  const result = await chrome.storage.local.get([date]);
  return result[date] || [];
}

async function saveTasksForDate(date, tasks) {
  await chrome.storage.local.set({ [date]: tasks });
}