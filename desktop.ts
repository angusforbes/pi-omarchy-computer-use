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
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export default function (pi: ExtensionAPI) {
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

  function findWindow(address?: string, search?: string): any {
    const clients = getClients();
    if (address) return clients.find((c: any) => c.address === address);
    if (search) {
      const q = search.toLowerCase();
      return clients.find(
        (c: any) =>
          c.class?.toLowerCase().includes(q) ||
          c.title?.toLowerCase().includes(q)
      );
    }
    return getActiveWindow();
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
        "Pass window_address or search to target a specific window; omit both for the focused window.",
      "desktop screenshot returns an image attachment. Use it before click/scroll to see the window.",
      "desktop click and scroll use absolute pixel coordinates within the window (x_px, y_px). " +
        "Take a screenshot first, note the window size, then compute pixel positions.",
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
        Type.String({ description: "Substring match on class or title" })
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
        Type.Number({ description: "X pixel offset within window (action=click/scroll)" })
      ),
      y_px: Type.Optional(
        Type.Number({ description: "Y pixel offset within window (action=click/scroll)" })
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
            const win = findWindow(params.window_address, params.search);
            if (!win) return err("Window not found");
            focusWindow(win.address);
            return ok(`Focused: ${win.class} — ${win.title}`);
          }

          case "screenshot": {
            const win = findWindow(params.window_address, params.search);
            if (!win) return err("Window not found");
            const [wx, wy] = win.at;
            const [ww, wh] = win.size;
            const tmpFile = join(tmpdir(), `pi-desktop-${randomUUID()}.jpg`);
            try {
              runFile("grim", ["-s", "1", "-g", `${wx},${wy} ${ww}x${wh}`, "-t", "jpeg", "-q", "90", tmpFile]);
              const imgBuf = readFileSync(tmpFile);
              const data = imgBuf.toString("base64");
              return {
                content: [
                  { type: "image", source: { type: "base64", mediaType: "image/jpeg", data } },
                  { type: "text", text: `Screenshot of ${win.class} — "${win.title}" (${ww}×${wh} at ${wx},${wy})` },
                ],
                details: {},
              };
            } finally {
              try { unlinkSync(tmpFile); } catch {}
            }
          }

          case "type": {
            if (!params.text) return err("text is required for type action");
            if (params.window_address || params.search) {
              const win = findWindow(params.window_address, params.search);
              if (!win) return err("Window not found");
              focusWindow(win.address);
              await sleep(50);
            }
            runFile("wtype", [params.text]);
            return ok(`Typed ${params.text.length} chars`);
          }

          case "key": {
            if (!params.key) return err("key is required for key action");
            if (params.window_address || params.search) {
              const win = findWindow(params.window_address, params.search);
              if (!win) return err("Window not found");
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
            return ok(`Pressed ${mods.length ? mods.join("+") + "+" : ""}${params.key}`);
          }

          case "click": {
            const win = findWindow(params.window_address, params.search);
            if (!win) return err("Window not found");
            const [wx, wy] = win.at;
            const xPx = params.x_px ?? Math.round(win.size[0] / 2);
            const yPx = params.y_px ?? Math.round(win.size[1] / 2);
            focusWindow(win.address);
            await sleep(30);
            moveCursor(wx + xPx, wy + yPx);
            await sleep(10);
            click(params.button || "left");
            return ok(`Clicked ${params.button || "left"} at (${xPx}, ${yPx}) in ${win.class}`);
          }

          case "scroll": {
            const win = findWindow(params.window_address, params.search);
            if (!win) return err("Window not found");
            const [wx, wy] = win.at;
            const xPx = params.x_px ?? Math.round(win.size[0] / 2);
            const yPx = params.y_px ?? Math.round(win.size[1] / 2);
            const steps = params.scroll_steps ?? 3;
            focusWindow(win.address);
            await sleep(30);
            moveCursor(wx + xPx, wy + yPx);
            await sleep(10);
            scroll(steps);
            return ok(`Scrolled ${steps > 0 ? "down" : "up"} ${Math.abs(steps)} steps in ${win.class}`);
          }

          case "close": {
            const win = findWindow(params.window_address, params.search);
            if (!win) return err("Window not found");
            closeWindow(win.address);
            return ok(`Closed: ${win.class} — ${win.title}`);
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
