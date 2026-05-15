const statusElement = document.getElementById("status");

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-ticket").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes(".freshdesk.com/")) {
    setStatus("Open a Freshdesk ticket tab first.");
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { type: "reopenPanel" }).catch(() => {});
  setStatus("If you are on a ticket page, analysis panel is active.");
});

function setStatus(text) {
  statusElement.textContent = text;
}
