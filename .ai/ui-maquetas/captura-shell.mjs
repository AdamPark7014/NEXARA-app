// Captura del shell real (next dev :3123) con Chrome headless vía CDP.
// La API (localhost:3001) se simula interceptando con Fetch: perfil, contadores y vacío para lo demás.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const APP = "http://localhost:3123";
const OUT = new URL("./png/real/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const ROUTE = process.argv[2] || "/erp/pizarra";
const PORT = 9333;

const user = {
  id: 7,
  nombre: "Adam Pozos",
  email: "adam@nexara.com.mx",
  role: "CEO",
  roleKey: "ceo",
  orgRoleKey: "ceo",
  nivelAutoridad: 100,
  department: "Dirección",
  departmentId: 1,
  token: "session-cookie",
  avatarUrl: "/uploads/avatars/adam.jpg",
  permissions: [],
  isSuperAdmin: false,
};
const avatar = readFileSync(new URL("./fotos/control-acceso-terminal-facial.jpg", import.meta.url));

const cors = [
  { name: "Access-Control-Allow-Origin", value: APP },
  { name: "Access-Control-Allow-Credentials", value: "true" },
  { name: "Access-Control-Allow-Headers", value: "authorization,content-type,x-company-id,x-requested-with,x-nexara-client" },
  { name: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
];

function mock(url, method) {
  if (method === "OPTIONS") return { status: 204, body: "" };
  const path = new URL(url).pathname.replace(/^\/(api\/)?/, "");
  if (path.startsWith("uploads/")) return { status: 200, body: avatar, type: "image/jpeg" };
  if (path === "auth/profile") return { status: 200, body: JSON.stringify(user) };
  if (path === "notifications/count/unread") return { status: 200, body: JSON.stringify({ unreadCount: 3 }) };
  if (path === "chat/channels")
    return {
      status: 200,
      body: JSON.stringify([
        { id: 1, unreadCount: 4, muted: false },
        { id: 2, unreadCount: 2, muted: false },
        { id: 3, unreadCount: 9, muted: true },
      ]),
    };
  if (path === "workflow/my-pending") return { status: 200, body: JSON.stringify([{ id: 1 }, { id: 2 }]) };
  if (path.startsWith("me/navigation")) return { status: 404, body: "{}" };
  return { status: 200, body: "[]" };
}

const profile = mkdtempSync(join(tmpdir(), "nx-cap-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-gpu",
  "--hide-scrollbars",
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    if (targets.some((t) => t.type === "page")) break;
  } catch {}
  await sleep(250);
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let seq = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const errors = [];
ws.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    return;
  }
  if (msg.method === "Fetch.requestPaused") {
    const { requestId, request } = msg.params;
    const m = mock(request.url, request.method);
    const body = Buffer.isBuffer(m.body) ? m.body : Buffer.from(m.body);
    send("Fetch.fulfillRequest", {
      requestId,
      responseCode: m.status,
      responseHeaders: [...cors, { name: "Content-Type", value: m.type || "application/json" }],
      body: body.toString("base64"),
    }).catch(() => {});
  }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails?.exception?.description?.slice(0, 200));
});

const evalJs = (expression) => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
const shot = async (name) => {
  await waitFor("[...document.images].every(i => i.complete)", 20000);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(new URL(name, OUT), Buffer.from(data, "base64"));
  console.log("ok", name);
};
const waitFor = async (expr, ms = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await evalJs(`!!(${expr})`).catch(() => null);
    if (r?.result?.value) return true;
    await sleep(500);
  }
  return false;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Fetch.enable", {
  patterns: [{ urlPattern: "http://localhost:3001/*" }, { urlPattern: `${APP}/api/*` }, { urlPattern: `${APP}/uploads/*` }],
});

async function capture(width, height, prefix) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await send("Page.navigate", { url: `${APP}/login` });
  await waitFor("document.readyState === 'complete'");
  await evalJs(`
    sessionStorage.setItem('nexara_user', ${JSON.stringify(JSON.stringify(user))});
    document.cookie = 'nx_session=1; Path=/; SameSite=Lax';
    localStorage.removeItem('nx-shell-collapsed');
    localStorage.removeItem('nx-shell-folded-groups');
  `);
  await send("Page.navigate", { url: APP + ROUTE });
  const ok = await waitFor("document.querySelector('aside nav a')");
  if (!ok) {
    await shot(`${prefix}-fallo.png`);
    console.log("sidebar no apareció:", (await evalJs("location.href")).result?.value);
    return;
  }
  await sleep(2500);
  await evalJs("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Ahora no')?.click()");
  await evalJs("document.body.classList.add('light'); document.body.classList.remove('dark')");
  await sleep(300);
  await shot(`${prefix}-claro.png`);
  if (width >= 900) {
    await evalJs("document.body.classList.add('dark'); document.body.classList.remove('light')");
    await sleep(400);
    await shot(`${prefix}-oscuro.png`);
    await evalJs("document.body.classList.add('light'); document.body.classList.remove('dark')");
    await evalJs("localStorage.setItem('nx-shell-collapsed','1')");
    await send("Page.reload");
    await waitFor("document.querySelector('aside nav a')");
    await sleep(2500);
    await evalJs("document.body.classList.add('light'); document.body.classList.remove('dark')");
    const r = await evalJs(
      "(() => { const a = [...document.querySelectorAll('aside nav a')].find(a => a.textContent.includes('Chat')); const b = a?.getBoundingClientRect(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : null; })()",
    );
    const [x, y] = r.result?.value || [34, 200];
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x - 4, y });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await sleep(400);
    await shot(`${prefix}-rail.png`);
  } else {
    await evalJs("document.querySelector('button[aria-label=\"Abrir menú\"]')?.click()");
    await sleep(800);
    await shot(`${prefix}-drawer.png`);
  }
}

try {
  await capture(1440, 900, "web");
  await capture(390, 844, "movil");
} finally {
  if (errors.length) console.log("errores de página:", errors.slice(0, 5));
  ws.close();
  chrome.kill();
}
