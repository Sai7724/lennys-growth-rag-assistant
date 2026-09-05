// Stubs the FastAPI backend (localhost:8000) so the frontend can be tested
// without the backend + Ollama running. Routes are registered on the page.
module.exports = async (page) => {
  await page.route("**/api/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        providers: [
          { value: "ollama", label: "Ollama", model: "qwen:latest", local: true, available: true },
        ],
        default: "ollama",
      }),
    })
  );

  await page.route("**/api/sessions", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock-session-1" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/chat", (route) => {
    const widget =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>NSM</title>" +
      "<style>body{margin:0;font-family:system-ui;background:#0e131b;color:#e8ecf3;" +
      "display:flex;align-items:center;justify-content:center;min-height:100vh}" +
      ".card{background:#121824;border:1px solid rgba(255,255,255,.1);border-radius:14px;" +
      "padding:28px;max-width:340px;text-align:center}" +
      ".num{font-size:44px;font-weight:800;color:#f5b93c}" +
      ".label{color:#8b94a7;font-size:12px;text-transform:uppercase;letter-spacing:.12em}" +
      ".bar{height:8px;background:#1c2330;border-radius:99px;margin-top:16px;overflow:hidden}" +
      ".fill{height:100%;width:62%;background:#f5b93c;border-radius:99px}</style></head>" +
      "<body><div class=\"card\"><div class=\"label\">North Star Metric</div>" +
      "<div class=\"num\">12,345</div><div class=\"label\">weekly activated users</div>" +
      "<div class=\"bar\"><div class=\"fill\"></div></div></div></body></html>";

    const events = [
      { type: "status", content: "Searching transcript archive…" },
      { type: "token", content: "Here is a compact widget for tracking your North Star metric." },
      {
        type: "token",
        content:
          '<artifact type="html" title="North Star Metric Widget">' +
          widget +
          "</artifact>",
      },
      {
        type: "token",
        content:
          "It shows the current value and a goal progress bar, and stays fully self-contained.",
      },
    ]
      .map((p) => `data: ${JSON.stringify(p)}\n\n`)
      .join("") + "data: [DONE]\n\n";

    return route.fulfill({ status: 200, contentType: "text/event-stream", body: events });
  });

  return "routes mocked";
};