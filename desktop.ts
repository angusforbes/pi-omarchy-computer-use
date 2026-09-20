/**
 * desktop — dialog-free desktop control for Hyprland/Wayland
 *
 * No leases, no approval dialogs, no window restrictions.
 * No ydotool. No daemon. No root.
 *
 * Cursor:  hyprctl dispatch movecursor (logical coords, exact)
 * Clicks:  wlrctl pointer (Wayland virtual pointer, no daemon)
 * Keyboard: wtype (real XKB keymap, unicode-safe)
 * Screenshots: grim (JPEG q90 default)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { execSync, execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export default function (pi: ExtensionAPI) {
  const LOG_DIR = join(process.env.HOME!, ".local", "share", "pi-desktop");
  const LOG_FILE = join(LOG_DIR, "training-data.jsonl");

  function ensureLogDir() {
    try {
      if (!existsSync(LOG_DIR)) {
        mkdirSync(LOG_DIR, { recursive: true });
      }
    } catch {}
  }

  function logTrainingData(
    action: string,
    params: any,
    windowState: any | null,
    allWindows: any[],
    result: string,
    isError: boolean
  ) {
    try {
      ensureLogDir();
      const entry = {
        timestamp: new Date().toISOString(),
        action,
        params,
        window_state: windowState,
        all_windows: allWindows.map((c: any) => ({
          address: c.address,
          class: c.class,
          title: c.title,
          workspace: c.workspace?.name,
        })),
        result,
        is_error: isError,
      };
      appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
    } catch {}
  }

  function run(cmd: string): string {
    return execSync(cmd, { encoding: "utf-8", timeout: 10_000 }).trim();
  }

  function runFile(file: string, args: string[]): string {
    return execFileSync(file, args, { encoding: "utf-8", timeout: 10_000 }).trim();
  }

  function moveCursor(x: number, y: number) {
    run(`hyprctl dispatch 'hl.dsp.cursor.move({ x = ${Math.round(x)}, y = ${Math.round(y)} })'`);
  }

  function focusWindow(address: string) {
    run(`hyprctl dispatch 'hl.dsp.focus({ window = "address:${address}" })'`);
  }

  function closeWindow(address: string) {
    run(`hyprctl dispatch 'hl.dsp.window.close({ window = "address:${address}" })'`);
  }

  function click(button: string = "left") {
    runFile("wlrctl", ["pointer", "click", button]);
  }

  function scroll(steps: number) {
    runFile("wlrctl", ["pointer", "scroll", String(steps)]);
  }

  function getClients(): any[] {
    return JSON.parse(run("hyprctl clients -j"));
  }

  function getActiveWindow(): any {
    return JSON.parse(run("hyprctl activewindow -j"));
  }

  // ── kev: local decision model for natural-language window selection ──
  const KEV_URL = process.env.KEV_URL ?? "http://127.0.0.1:8009/v1/systemone";
  const KEV_GATE = 0.5;   // below this, kev's pick is reported but flagged as uncertain
  const APP_HINTS: Record<string, string> = {
    "io.github.lgse.Strata": "Strata file browser, file manager",
    "foot": "foot terminal, shell, command line",
    "chromium": "Chromium web browser", "brave-origin": "Brave web browser",
    "slack": "Slack chat, messaging", "md.obsidian.Obsidian": "Obsidian notes, markdown",
    "org.omarchy.agent": "AI agent pane, Claude Code, assistant chat",
  };
  function describeWin(c: any): string {
    let t: string = c.title ?? "";
    for (const s of [" - Chromium", " - Brave Origin", " - Google Search", " - Slack"]) t = t.replace(s, "");
    t = t.replace(/^[\s✳◑●○]+|[\s✳◑●○]+$/g, "").slice(0, 60);
    return `${t} — ${APP_HINTS[c.class] ?? c.class}`;
  }
  /** Ask kev which window matches. Returns {win, p, ms} or null if kev is down. */
  async function kevPick(query: string, clients: any[]): Promise<{ win: any; p: number; ms: number } | null> {
    if (clients.length === 0) return null;
    if (clients.length === 1) return { win: clients[0], p: 1, ms: 0 };
    const criteria: Record<string, string> = {};
    for (const c of clients) criteria[c.address] = describeWin(c);
    const body = { model: "kev", state: `The user wants to interact with: "${query}"`,
      questions: { w: { type: "choice", instructions: "Which open window best matches what the user described?", criteria } } };
    const t0 = Date.now();
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(KEV_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(tm);
      if (!r.ok) return null;
      const j: any = await r.json();
      const a = j.answers?.w; if (!a) return null;
      const win = clients.find((c: any) => c.address === a.choice);
      return win ? { win, p: a.probabilities[a.choice], ms: Date.now() - t0 } : null;
    } catch { return null; }
  }
  let lastPick: { query: string; p: number; ms: number; via: string } | null = null;

  function visibleClients(): any[] {
    return getClients().filter((c: any) => c.mapped && c.workspace?.name !== "special:reprieve");
  }

  async function findWindow(address?: string, search?: string): Promise<any> {
    lastPick = null;
    const clients = getClients();
    if (address) return clients.find((c: any) => c.address === address);
    if (search) {
      // 1. exact substring on class/title — free, and right when the caller already knows the name
      const q = search.toLowerCase();
      const exact = clients.find((c: any) => c.class?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q));
      if (exact) { lastPick = { query: search, p: 1, ms: 0, via: "substring" }; return exact; }
      // 2. kev — natural language ("the file browser", "that youtube tab")
      const k = await kevPick(search, visibleClients());
      if (k) { lastPick = { query: search, p: k.p, ms: k.ms, via: "kev" }; return k.p >= KEV_GATE ? k.win : null; }
      return null;
    }
    return getActiveWindow();
  }
  /** Suffix for result text: how the window was chosen. */
  function pickNote(): string {
    if (!lastPick || lastPick.via === "substring") return "";
    return ` [kev: ${(lastPick.p * 100).toFixed(0)}% in ${lastPick.ms}ms]`;
  }
  function notFound(search?: string): string {
    if (lastPick && lastPick.via === "kev") {
      return `No confident match for "${search}" (kev best guess ${(lastPick.p * 100).toFixed(0)}% < ${KEV_GATE * 100}%). ` +
             `The app may not be open — check list_windows, or launch it.`;
    }
    return `Window not found for "${search ?? "(active)"}"`;
  }

  pi.registerTool({
    name: "desktop",
    label: "Desktop",
    description:
      "Interact with any window on the Hyprland desktop. No approval required. " +
      "Actions: list_windows, active_window, focus, screenshot, type, key, click, scroll, close.",
    promptSnippet:
      "Desktop control — screenshot any window, type, click, scroll, focus, list windows (no approval needed)",
    promptGuidelines: [
      "Use desktop to interact with any desktop window without approval. " +
        "Pass window_address or search to target a specific window; omit both for the focused window. " +
        "search accepts natural language ('the file browser') — a local kev model resolves it in ~200ms. " +
        "If it says no confident match, the app is probably not open: check list_windows or launch it.",
      "desktop screenshot returns an image attachment. Use it before click/scroll to see the window.",
      "desktop click and scroll accept normalized coordinates (x_pct, y_pct) as 0.0-1.0 fractions of window size. " +
        "Prefer x_pct/y_pct over x_px/y_px — e.g. center=(0.5,0.5), top-left=(0.1,0.1), bottom-right=(0.9,0.9). " +
        "Take a screenshot first to see what's on screen, then estimate the fractional position.",
    ],
    parameters: Type.Object({
      action: StringEnum([
        "list_windows", "active_window", "focus", "screenshot",
        "type", "key", "click", "scroll", "close",
      ] as const),
      window_address: Type.Optional(
        Type.String({ description: "Hyprland window address (e.g. 0x55a67366ab70)" })
      ),
      search: Type.Optional(
        Type.String({ description: "Window to target. Exact substring of class/title is tried first (free); otherwise natural language via local kev model, e.g. 'the file browser', 'that youtube tab', 'my terminal'. Result notes kev confidence when used." })
      ),
      text: Type.Optional(
        Type.String({ description: "Text to type (action=type)" })
      ),
      key: Type.Optional(
        Type.String({
          description:
            "Key name for wtype -k (action=key). Examples: Return, Tab, Escape, BackSpace, " +
            "Up, Down, Left, Right, space, Home, End, Page_Up, Page_Down, Delete, F1-F12, " +
            "plus combos via wtype -M/-m for modifiers",
        })
      ),
      modifiers: Type.Optional(
        Type.Array(
          StringEnum(["ctrl", "alt", "shift", "super"] as const),
          { description: "Modifier keys to hold during key/click action" }
        )
      ),
      x_px: Type.Optional(
        Type.Number({ description: "X pixel offset within window (action=click/scroll). Use this OR x_pct." })
      ),
      y_px: Type.Optional(
        Type.Number({ description: "Y pixel offset within window (action=click/scroll). Use this OR y_pct." })
      ),
      x_pct: Type.Optional(
        Type.Number({ description: "X as 0.0-1.0 fraction of window width (action=click/scroll). 0=left, 0.5=center, 1=right.", minimum: 0, maximum: 1 })
      ),
      y_pct: Type.Optional(
        Type.Number({ description: "Y as 0.0-1.0 fraction of window height (action=click/scroll). 0=top, 0.5=center, 1=bottom.", minimum: 0, maximum: 1 })
      ),
      button: Type.Optional(
        StringEnum(["left", "right", "middle"] as const, {
          description: "Mouse button for click (default: left)",
        })
      ),
      scroll_steps: Type.Optional(
        Type.Integer({
          description: "Scroll amount: positive=down, negative=up (action=scroll)",
          minimum: -20, maximum: 20,
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const allWindows = params.action !== "list_windows" ? getClients() : [];
      try {
        switch (params.action) {
          case "list_windows": {
            const clients = getClients();
            const summary = clients.map((c: any) => ({
              address: c.address, class: c.class, title: c.title,
              workspace: c.workspace?.name, size: c.size, at: c.at,
              focused: c.focusHistoryID === 0, pid: c.pid,
            }));
            return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }], details: {} };
          }

          case "active_window": {
            const win = getActiveWindow();
            return {
              content: [{ type: "text", text: JSON.stringify({
                address: win.address, class: win.class, title: win.title,
                workspace: win.workspace?.name, size: win.size, at: win.at, pid: win.pid,
              }, null, 2) }],
              details: {},
            };
          }

          case "focus": {
            const win = await findWindow(params.window_address, params.search);
            if (!win) {
              const errMsg = notFound(params.search);
              logTrainingData("focus", params, null, allWindows, errMsg, true);
              return err(errMsg);
            }
            focusWindow(win.address);
            const result = `Focused: ${win.class} — ${win.title}` + pickNote();
            const windowState = {
              address: win.address, class: win.class, title: win.title,
              workspace: win.workspace?.name, position: win.at, size: win.size,
            };
            logTrainingData("focus", params, windowState, allWindows, result, false);
            return ok(result);
          }

          case "screenshot": {
            const win = await findWindow(params.window_address, params.search);
            if (!win) return err(notFound(params.search));
            const [wx, wy] = win.at;
            const [ww, wh] = win.size;
            const tmpFile = join(tmpdir(), `pi-desktop-${randomUUID()}.jpg`);
            try {
              runFile("grim", ["-s", "1", "-g", `${wx},${wy} ${ww}x${wh}`, "-t", "jpeg", "-q", "90", tmpFile]);
              const imgBuf = readFileSync(tmpFile);
              const data = imgBuf.toString("base64");
              return {
                content: [
                  { type: "image", data, mimeType: "image/jpeg" },
                  { type: "text", text: `Screenshot of ${win.class} — "${win.title}" (${ww}×${wh} at ${wx},${wy})${pickNote()}. Use x_pct/y_pct (0.0-1.0) to click relative to window: 0.0=left/top, 0.5=center, 1.0=right/bottom. Or x_px/y_px for pixel offset.` },
                ],
                details: {},
              };
            } finally {
              try { unlinkSync(tmpFile); } catch {}
            }
          }

          case "type": {
            if (!params.text) {
              const errMsg = "text is required for type action";
              logTrainingData("type", params, null, allWindows, errMsg, true);
              return err(errMsg);
            }
            let win: any = null;
            if (params.window_address || params.search) {
              win = await findWindow(params.window_address, params.search);
              if (!win) {
                const errMsg = notFound(params.search);
                logTrainingData("type", params, null, allWindows, errMsg, true);
                return err(errMsg);
              }
              focusWindow(win.address);
              await sleep(50);
            }
            runFile("wtype", [params.text]);
            const result = `Typed ${params.text.length} chars`;
            const windowState = win ? {
              address: win.address, class: win.class, title: win.title,
              workspace: win.workspace?.name, position: win.at, size: win.size,
            } : null;
            logTrainingData("type", params, windowState, allWindows, result, false);
            return ok(result);
          }

          case "key": {
            if (!params.key) {
              const errMsg = "key is required for key action";
              logTrainingData("key", params, null, allWindows, errMsg, true);
              return err(errMsg);
            }
            let win: any = null;
            if (params.window_address || params.search) {
              win = await findWindow(params.window_address, params.search);
              if (!win) {
                const errMsg = notFound(params.search);
                logTrainingData("key", params, null, allWindows, errMsg, true);
                return err(errMsg);
              }
              focusWindow(win.address);
              await sleep(50);
            }
            const args: string[] = [];
            const mods = params.modifiers ?? [];
            for (const mod of mods) {
              const mk = modMap[mod]; if (mk) args.push("-M", mk);
            }
            args.push("-k", params.key);
            for (const mod of [...mods].reverse()) {
              const mk = modMap[mod]; if (mk) args.push("-m", mk);
            }
            runFile("wtype", args);
            const result = `Pressed ${mods.length ? mods.join("+") + "+" : ""}${params.key}`;
            const windowState = win ? {
              address: win.address, class: win.class, title: win.title,
              workspace: win.workspace?.name, position: win.at, size: win.size,
            } : null;
            logTrainingData("key", params, windowState, allWindows, result, false);
            return ok(result);
          }

          case "click": {
            const win = await findWindow(params.window_address, params.search);
            if (!win) {
              const errMsg = notFound(params.search);
              logTrainingData("click", params, null, allWindows, errMsg, true);
              return err(errMsg);
            }
            const [wx, wy] = win.at;
            const xPx = params.x_px ?? (params.x_pct != null ? Math.round(params.x_pct * win.size[0]) : Math.round(win.size[0] / 2));
            const yPx = params.y_px ?? (params.y_pct != null ? Math.round(params.y_pct * win.size[1]) : Math.round(win.size[1] / 2));
            focusWindow(win.address);
            await sleep(30);
            moveCursor(wx + xPx, wy + yPx);
            await sleep(10);
            click(params.button || "left");
            const result = `Clicked ${params.button || "left"} at (${xPx}, ${yPx}) in ${win.class}` + pickNote();
            const windowState = {
              address: win.address, class: win.class, title: win.title,
              workspace: win.workspace?.name, position: win.at, size: win.size,
            };
            logTrainingData("click", params, windowState, allWindows, result, false);
            return ok(result);
          }

          case "scroll": {
            const win = await findWindow(params.window_address, params.search);
            if (!win) {
              const errMsg = notFound(params.search);
              logTrainingData("scroll", params, null, allWindows, errMsg, true);
              return err(errMsg);
            }
            const [wx, wy] = win.at;
            const xPx = params.x_px ?? (params.x_pct != null ? Math.round(params.x_pct * win.size[0]) : Math.round(win.size[0] / 2));
            const yPx = params.y_px ?? (params.y_pct != null ? Math.round(params.y_pct * win.size[1]) : Math.round(win.size[1] / 2));
            const steps = params.scroll_steps ?? 3;
            focusWindow(win.address);
            await sleep(30);
            moveCursor(wx + xPx, wy + yPx);
            await sleep(10);
            scroll(steps);
            const result = `Scrolled ${steps > 0 ? "down" : "up"} ${Math.abs(steps)} steps in ${win.class}` + pickNote();
            const windowState = {
              address: win.address, class: win.class, title: win.title,
              workspace: win.workspace?.name, position: win.at, size: win.size,
            };
            logTrainingData("scroll", params, windowState, allWindows, result, false);
            return ok(result);
          }

          case "close": {
            const win = await findWindow(params.window_address, params.search);
            if (!win) {
              const errMsg = notFound(params.search);
              logTrainingData("close", params, null, allWindows, errMsg, true);
              return err(errMsg);
            }
            closeWindow(win.address);
            const result = `Closed: ${win.class} — ${win.title}` + pickNote();
            const windowState = {
              address: win.address, class: win.class, title: win.title,
              workspace: win.workspace?.name, position: win.at, size: win.size,
            };
            logTrainingData("close", params, windowState, allWindows, result, false);
            return ok(result);
          }

          default:
            return err(`Unknown action: ${params.action}`);
        }
      } catch (e: any) {
        return err(e.message || String(e));
      }
    },
  });
}

const modMap: Record<string, string> = {
  ctrl: "ctrl", alt: "alt", shift: "shift", super: "logo",
};

function ok(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], details: {} };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], details: {}, isError: true };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
