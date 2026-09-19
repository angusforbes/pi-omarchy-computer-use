# Desktop Control Lessons (Hyprland / Wayland)

Hard-won notes from building and testing `~/.pi/agent/extensions/desktop.ts`.
**Read before any desktop automation work.**

## Current tool stack (v4, ydotool-free)

| Tool | Purpose | Speed |
|---|---|---|
| `hyprctl dispatch` | Cursor movement, focus, workspace switch, close | ~13ms |
| `wlrctl` | Clicks, scroll (Wayland virtual pointer) | ~7ms |
| `wtype` | Typing text, key combos (Wayland virtual keyboard) | ~5ms |
| `grim` | Screenshots (JPEG q90 default) | ~65ms |

No daemon. No root. No evdev. Pure Wayland.

## ydotool (DEPRECATED — kept for reference)

ydotool is no longer used in the extension. These notes are kept in case
it's needed as a fallback (e.g. for compositor keybinds that wtype can't
trigger).

- Socket: `/run/ydotoold/socket` (not the default path)
- Absolute coords: `logical / monitorScale` (NOT logical, NOT physical)
- Click codes: `0xC0`=left, `0xC1`=right, `0xC2`=middle
- Scroll: `ydotool mousemove --wheel -x 0 -y N`
- Type: `ydotool type -d 30 "text"`
- Key combos: `ydotool key 29:1 46:1 46:0 29:0` (Ctrl+C)
- SUPER key (evdev 125) works at compositor level — wtype cannot trigger
  compositor binds (SUPER+N etc). But `hyprctl dispatch` can switch
  workspaces directly, so ydotool is not needed for this either.

## 1. Hyprland 0.56+ Lua dispatch

The old `hyprctl dispatch focuswindow address:0xABC` is **DEAD**.
Everything now goes through `hyprctl eval` with Lua tables:

```bash
# Focus a window
hyprctl eval 'hl.dsp.focus({window = "address:0x55a67391cd20"})'

# Close a window
hyprctl eval 'hl.dsp.window.close({window = "address:0x55a67391cd20"})'

# List hl.dsp dispatchers (discovery trick)
hyprctl eval 'local s="" for k,_ in pairs(hl.dsp) do s=s..k.."," end error(s)'
```

### Available hl.dsp namespaces (v0.56.2)
```
focus, window, workspace, exec_cmd, cursor, group, submap,
force_idle, exit, force_renderer_reload, event, exec_raw,
layout, pass, dpms, send_key_state, send_shortcut, no_op,
global, release_input_capture
```

### hl.dsp.window methods
```
set_prop, center, move, swap, cycle_next, drag, deny_from_group,
toggle_swallow, pseudo, tag, float, alter_zorder, fullscreen_state,
kill, signal, pin, fullscreen, close, clear_tags, bring_to_top, resize
```

### Workspace switching
`hl.dsp.workspace` only has: `change_id, move, toggle_special, swap_monitors, rename`.
No "go to" — use keyboard shortcut instead:
```bash
# SUPER+3 to switch to workspace 3
ydotool key 125:1 4:1 4:0 125:0
```

### Discovering any hl table
```bash
hyprctl eval 'local s="" for k,_ in pairs(hl) do s=s..k.."," end error(s)'
```

## 2. wtype limitations

wtype is a **virtual keyboard** — it cannot trigger:
- **Compositor keybinds** (SUPER+N, SUPER+Q etc) — use `hyprctl dispatch`
- **Terminal emulator keybinds** (Ctrl+Shift+V paste, Ctrl+Shift+C copy) —
  these are handled by the terminal app before the Wayland keyboard protocol.
  Workaround: use `wl-paste` to read clipboard and `wtype` the content directly.
  Or fall back to ydotool for Ctrl+Shift+V (evdev level triggers them).

```bash
# Instead of trying to paste:
FILEPATH=$(wl-paste)
wtype "open '${FILEPATH}'"
```

## 3. wtype modifier names

Lowercase strings only: `ctrl`, `alt`, `shift`, `logo` (for Super), `altgr`, `capslock`, `win`.
NOT `Control_L`, `Alt_L`, etc. Those are xdotool names.

```bash
wtype -M ctrl -k a -m ctrl    # Ctrl+A
wtype -M ctrl -M shift -k v -m shift -m ctrl   # Ctrl+Shift+V
```

## 3. grim screenshots

```bash
grim -s 1 -g "x,y WxH" -t png /tmp/out.png
```
- `-s 1` forces 1× scale (without it, a 2× display gives 2× resolution images — huge)
- Geometry uses **logical** coordinates (Hyprland layout coords)
- `-t png` or `-t jpeg -q 80`

## 4. Strata file browser

- **Open folder**: select it, press Enter (or click the `>` arrow)
- **Copy file path**: select file, press Ctrl+C → full path goes to clipboard
- **Verify clipboard**: `wl-paste` shows what's copied
- Double-click may not reliably open folders; Enter after single-click is safer

## 5. Pi extension image return format

Pi's tool return content blocks use **camelCase** `mediaType`, not Anthropic's
snake_case `media_type`:
```typescript
{
  type: "image",
  source: {
    type: "base64",
    mediaType: "image/png",   // NOT media_type
    data: base64String,
  },
}
```

## 6. Running input from pi's bash

When pi runs ydotool/wtype commands via bash, focus timing matters:
- **wtype** types into the Wayland-focused window. If pi's terminal has focus,
  text goes there instead of the target. Use ydotool type for cross-window.
- **ydotool type** works at evdev level — types into whatever has keyboard
  focus at the kernel level. More reliable for automation.
- For complex sequences, write a shell script and run via `nohup` in background
  to avoid pi's terminal intercepting keystrokes or timing out.

## 7. Pi TUI input area

Pi's editor input widget is NOT a standard terminal text area. You cannot:
- Mouse-select text in it with triple-click
- Copy from it with Ctrl+Shift+C
Use the filesystem or wl-copy/wl-paste for clipboard operations instead.

## 8. Workspace switching — three methods

**Fastest (preferred):** `hyprctl dispatch` with Lua focus:
```bash
hyprctl dispatch 'hl.dsp.focus({workspace = "3"})'
```
~13ms, no external tool needed.

**Alternative — top bar click:** The top-left of the omarchy bar shows workspace
numbers (1, 2, 3…). The active workspace has a square covering its number.
Clicking a number switches workspaces. Useful if you're already moving the
cursor near the bar. Logical coords: roughly y=8, x varies by workspace number
(~25px spacing starting around x=25).

**Fallback — ydotool SUPER+N:** evdev keycodes (SUPER=125, 1=2, 2=3, 3=4…).
Works but requires ydotoold daemon. Not needed anymore.

## 9. Resolution

If desktop interactions are failing due to resolution/scaling issues, you are
**authorized to increase the monitor resolution**. Use:
```bash
hyprctl keyword monitor eDP-1,2880x1800@60,0x0,1   # scale 1 = full res
hyprctl keyword monitor eDP-1,2880x1800@60,0x0,1.5  # scale 1.5
hyprctl keyword monitor eDP-1,2880x1800@60,0x0,2    # scale 2 (default)
```
Lower scale = more logical pixels = more room = easier targeting.
Higher scale = bigger UI elements = easier to read in screenshots.
Current: scale 2 (logical 1440×900).

## 10. hypruse approach — better mouse input (future improvement)

hypruse (https://github.com/IlyasKhallouki/hypruse) avoids ydotool entirely:
- **Cursor positioning**: `hyprctl dispatch movecursor X Y` — uses the compositor's
  own cursor dispatcher with global logical coordinates. No coordinate translation
  needed, no multi-monitor bugs.
- **Clicks/scroll**: raw Wayland `zwlr_virtual_pointer_v1` wire protocol — sends
  button/axis events as a native Wayland client. No daemon, no root, no evdev.
- **Keyboard**: still uses `wtype` (same as us), which is the right tool.

This is superior because:
1. No ydotoold daemon dependency
2. Coordinates are plain Hyprland logical coords (no `logical/scale` math)
3. Works on any keyboard layout (wtype uses real XKB keymap)
4. Sidesteps multi-monitor absolute positioning bugs
   (https://github.com/hyprwm/Hyprland/issues/6749)

Consider migrating pointer input from ydotool to `hyprctl dispatch movecursor`
+ a small Wayland virtual-pointer client for clicks. Or just use hypruse as
an MCP server alongside the extension.

## 11. Full-desktop screenshot

```bash
grim -s 1 -g "0,0 1440x900" -t png /tmp/full-desktop.png
```
Uses logical resolution (1440×900 on this machine). Useful for seeing the
complete layout including tab bars, workspace indicators, etc.
