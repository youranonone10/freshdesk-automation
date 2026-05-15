const statusElement = document.getElementById("status");

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-ticket").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isFreshdesk = isFreshdeskUrl(tab?.url);
  if (!tab?.id || !isFreshdesk) {
    setStatus("Open a Freshdesk ticket tab first.");
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { type: "reopenPanel" }).catch(() => {});
  setStatus("If you are on a ticket page, analysis panel is active.");
});

function setStatus(text) {
  statusElement.textContent = text;
}

function isFreshdeskUrl(urlValue) {
  if (!urlValue) {
    return false;
  }
  try {
    const parsed = new URL(urlValue);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".freshdesk.com");
  } catch (_error) {
    return false;
  }
}
