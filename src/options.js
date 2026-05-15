const elements = {
  freshdeskDomain: document.getElementById("freshdesk-domain"),
  freshdeskApiKey: document.getElementById("freshdesk-api-key"),
  anthropicApiKey: document.getElementById("anthropic-api-key"),
  anthropicModel: document.getElementById("anthropic-model"),
  status: document.getElementById("status")
};

document.getElementById("save").addEventListener("click", async () => {
  const payload = {
    type: "saveSettings",
    freshdeskDomain: elements.freshdeskDomain.value,
    freshdeskApiKey: elements.freshdeskApiKey.value,
    anthropicApiKey: elements.anthropicApiKey.value,
    anthropicModel: elements.anthropicModel.value || "claude-3-5-sonnet-latest"
  };

  const result = await chrome.runtime.sendMessage(payload);
  if (!result?.ok) {
    setStatus(`Save failed: ${result?.error || "Unknown error"}`);
    return;
  }
  setStatus("Settings saved.");
});

loadSettings();

async function loadSettings() {
  const result = await chrome.runtime.sendMessage({ type: "getSettings" });
  if (!result?.ok) {
    setStatus(`Could not load settings: ${result?.error || "Unknown error"}`);
    return;
  }

  const settings = result.settings || {};
  elements.freshdeskDomain.value = settings.freshdeskDomain || "";
  elements.freshdeskApiKey.value = settings.freshdeskApiKey || "";
  elements.anthropicApiKey.value = settings.anthropicApiKey || "";
  elements.anthropicModel.value = settings.anthropicModel || "claude-3-5-sonnet-latest";
}

function setStatus(text) {
  elements.status.textContent = text;
}
