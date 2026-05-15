(function initFreshdeskAssistant() {
  if (!location.hostname.endsWith(".freshdesk.com")) {
    return;
  }

  const ticketId = extractTicketId();
  if (!ticketId || document.getElementById("fda-assistant-panel")) {
    return;
  }

  injectPanel(ticketId);
})();

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "reopenPanel") {
    return;
  }
  const ticketId = extractTicketId();
  if (!ticketId) {
    return;
  }
  const existing = document.getElementById("fda-assistant-panel");
  if (existing) {
    existing.style.display = "block";
    return;
  }
  injectPanel(ticketId);
});

function extractTicketId() {
  const match = location.pathname.match(/tickets\/(\d+)/i);
  return match ? match[1] : null;
}

function injectPanel(ticketId) {
  const panel = document.createElement("aside");
  panel.id = "fda-assistant-panel";
  panel.innerHTML = `
    <div class="fda-header">
      <h2>AI Resolution Assistant</h2>
      <button id="fda-close" title="Close">×</button>
    </div>
    <div id="fda-status">Analyzing ticket #${escapeHtml(ticketId)}...</div>
    <div class="fda-section">
      <h3>Ticket Summary</h3>
      <div id="fda-summary">Loading…</div>
    </div>
    <div class="fda-section">
      <h3>Conversation Analysis</h3>
      <div id="fda-analysis">Loading…</div>
    </div>
    <div class="fda-section">
      <h3>Suggested Resolution</h3>
      <textarea id="fda-suggestion" rows="8"></textarea>
      <div class="fda-actions">
        <button id="fda-apply">Apply to Reply Box</button>
        <button id="fda-copy">Copy</button>
        <button id="fda-refresh">Refresh</button>
      </div>
    </div>
    <div class="fda-section">
      <h3>Relevant Articles</h3>
      <ul id="fda-articles"></ul>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById("fda-close").addEventListener("click", () => panel.remove());
  document.getElementById("fda-apply").addEventListener("click", applySuggestionToEditor);
  document.getElementById("fda-copy").addEventListener("click", copySuggestion);
  document.getElementById("fda-refresh").addEventListener("click", () => analyze(ticketId));

  analyze(ticketId);
}

async function analyze(ticketId) {
  setStatus("Analyzing with Freshdesk + Claude…");
  const domConversations = scrapeConversationsFromPage();
  const response = await chrome.runtime.sendMessage({
    type: "analyzeTicket",
    ticketId,
    conversations: domConversations
  });

  if (!response?.ok) {
    setStatus(`Error: ${response?.error || "Could not analyze ticket."}`);
    return;
  }

  renderResult(response);
  setStatus("Analysis ready.");
}

function renderResult(response) {
  const suggestion = response.aiSuggestion || "";
  document.getElementById("fda-suggestion").value = suggestion;

  const summary = extractSection(suggestion, "Ticket Summary");
  const analysis = extractSection(suggestion, "Conversation Analysis");
  document.getElementById("fda-summary").textContent = summary || response.ticket?.subject || "No summary available.";
  document.getElementById("fda-analysis").textContent =
    analysis || "Conversation analyzed. Review suggestion for details.";

  const list = document.getElementById("fda-articles");
  list.innerHTML = "";
  (response.articles || []).forEach((article) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = safeExternalUrl(article.html_url || article.url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title || "Untitled article";
    item.appendChild(link);
    list.appendChild(item);
  });
}

function scrapeConversationsFromPage() {
  const elements = document.querySelectorAll(
    ".ticket-conversation, .conversation-thread, .requestor-response, .agent-response, [data-test-id='conversation-item']"
  );
  return Array.from(elements)
    .map((entry) => entry.textContent.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: index + 1,
      body_text: text.slice(0, 5000)
    }));
}

function applySuggestionToEditor() {
  const suggestion = document.getElementById("fda-suggestion").value.trim();
  if (!suggestion) {
    setStatus("Nothing to apply.");
    return;
  }

  const editor =
    document.querySelector("[contenteditable='true']") ||
    document.querySelector("textarea[name='reply']") ||
    document.querySelector("textarea");

  if (!editor) {
    setStatus("Reply editor not found. Copied suggestion instead.");
    navigator.clipboard.writeText(suggestion).catch(() => {});
    return;
  }

  if (editor.matches("[contenteditable='true']")) {
    editor.innerText = suggestion;
  } else {
    editor.value = suggestion;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }
  setStatus("Suggestion applied to reply box.");
}

function copySuggestion() {
  const suggestion = document.getElementById("fda-suggestion").value;
  navigator.clipboard
    .writeText(suggestion)
    .then(() => setStatus("Suggestion copied."))
    .catch(() => setStatus("Copy failed."));
}

function extractSection(markdown, heading) {
  const pattern = new RegExp(`#+\\s*${heading}[\\s\\S]*?(?=\\n#+\\s|$)`, "i");
  const match = markdown.match(pattern);
  if (!match) {
    return "";
  }
  return match[0].replace(new RegExp(`#+\\s*${heading}\\s*`, "i"), "").trim();
}

function setStatus(text) {
  const status = document.getElementById("fda-status");
  if (status) {
    status.textContent = text;
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function safeExternalUrl(value) {
  if (!value) {
    return "#";
  }
  try {
    const url = new URL(value, location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "#";
  } catch (_error) {
    return "#";
  }
}
