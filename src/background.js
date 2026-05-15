const CACHE_TTL_MS = 15 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["freshdeskDomain", "freshdeskApiKey", "anthropicApiKey"], (settings) => {
    if (!settings.freshdeskDomain || !settings.freshdeskApiKey || !settings.anthropicApiKey) {
      chrome.runtime.openOptionsPage();
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    analyzeTicket: handleAnalyzeTicket,
    saveSettings: handleSaveSettings,
    getSettings: handleGetSettings
  };
  const handler = handlers[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: "Unsupported action." });
    return false;
  }

  handler(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Unknown error" }));
  return true;
});

async function handleSaveSettings(message) {
  await chrome.storage.sync.set({
    freshdeskDomain: normalizeDomain(message.freshdeskDomain),
    freshdeskApiKey: message.freshdeskApiKey?.trim(),
    anthropicApiKey: message.anthropicApiKey?.trim(),
    anthropicModel: (message.anthropicModel || "claude-3-5-sonnet-latest").trim()
  });
  return {};
}

async function handleGetSettings() {
  const settings = await chrome.storage.sync.get([
    "freshdeskDomain",
    "freshdeskApiKey",
    "anthropicApiKey",
    "anthropicModel"
  ]);
  return { settings: { ...settings, anthropicApiKey: settings.anthropicApiKey ? "••••••••" : "" } };
}

async function handleAnalyzeTicket(message) {
  const { ticketId, conversations = [] } = message;
  if (!ticketId) {
    throw new Error("Ticket ID is required.");
  }

  const settings = await chrome.storage.sync.get([
    "freshdeskDomain",
    "freshdeskApiKey",
    "anthropicApiKey",
    "anthropicModel"
  ]);

  if (!settings.freshdeskDomain || !settings.freshdeskApiKey || !settings.anthropicApiKey) {
    throw new Error("Please configure Freshdesk and Claude API settings in extension options.");
  }

  const ticketData = await fetchTicketData(settings, ticketId);
  const allConversations = conversations.length ? conversations : ticketData.conversations;
  const articles = await getArticlesWithCache(settings, ticketData.ticket.subject, allConversations);
  const aiSuggestion = await getClaudeSuggestion(settings, ticketData.ticket, allConversations, articles);

  return {
    ticket: ticketData.ticket,
    conversations: allConversations,
    articles,
    aiSuggestion
  };
}

async function fetchTicketData(settings, ticketId) {
  const base = getFreshdeskBaseUrl(settings.freshdeskDomain);
  const [ticket, conversations] = await Promise.all([
    freshdeskGet(settings, `${base}/api/v2/tickets/${ticketId}`),
    freshdeskGet(settings, `${base}/api/v2/tickets/${ticketId}/conversations`)
  ]);
  return { ticket, conversations };
}

async function getArticlesWithCache(settings, subject, conversations) {
  const query = `${subject || ""} ${(conversations || [])
    .map((entry) => entry.body_text || entry.body || "")
    .join(" ")
    .slice(0, 400)}`.trim();
  const key = `kb:${simpleHash(query)}`;
  const now = Date.now();
  const cached = await chrome.storage.local.get([key]);
  if (cached[key] && now - cached[key].timestamp < CACHE_TTL_MS) {
    return cached[key].articles;
  }

  const base = getFreshdeskBaseUrl(settings.freshdeskDomain);
  const encoded = encodeURIComponent(query.slice(0, 256) || "ticket resolution");
  const response = await freshdeskGet(settings, `${base}/api/v2/search/solutions?term=${encoded}`);
  const articles = Array.isArray(response.results) ? response.results.slice(0, 5) : [];
  await chrome.storage.local.set({
    [key]: {
      timestamp: now,
      articles
    }
  });
  return articles;
}

async function getClaudeSuggestion(settings, ticket, conversations, articles) {
  const payload = {
    model: settings.anthropicModel || "claude-3-5-sonnet-latest",
    max_tokens: 1200,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildPrompt(ticket, conversations, articles)
          }
        ]
      }
    ]
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await readSafeText(response);
    throw new Error(`Claude API failed (${response.status}): ${details}`);
  }

  const json = await response.json();
  const content = Array.isArray(json.content) ? json.content : [];
  const combinedText = content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return combinedText || "No suggestion generated.";
}

function buildPrompt(ticket, conversations, articles) {
  return `You are a senior Freshdesk support quality reviewer.
Analyze this ticket and provide:
1) Short ticket summary
2) Root-cause/conversation analysis
3) A rewritten best possible response that the agent can send
4) Why your response is better and which article references were used

Return with clear markdown headings.

Ticket:
${JSON.stringify(ticket, null, 2)}

Conversations:
${JSON.stringify(conversations, null, 2)}

Knowledge Base Articles:
${JSON.stringify(articles, null, 2)}`;
}

async function freshdeskGet(settings, url) {
  const auth = btoa(`${settings.freshdeskApiKey}:X`);
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const details = await readSafeText(response);
    throw new Error(`Freshdesk API failed (${response.status}): ${details}`);
  }
  return response.json();
}

function normalizeDomain(domain) {
  if (!domain) {
    return "";
  }
  return domain.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function getFreshdeskBaseUrl(domain) {
  const clean = normalizeDomain(domain);
  if (!clean.endsWith(".freshdesk.com")) {
    throw new Error("Freshdesk domain should look like yourcompany.freshdesk.com");
  }
  return `https://${clean}`;
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

async function readSafeText(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch (_error) {
    return "";
  }
}
