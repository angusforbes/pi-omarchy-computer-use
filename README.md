# pi-omarchy-computer-use

Dialog-free desktop control for [Pi](https://github.com/angusforbes/pi) agents on [Omarchy](https://omarchy.com) (Hyprland/Wayland).

No leases. No approval dialogs. No ydotool. No daemon. No root.

## Stack

| Tool | Purpose | Speed |
|---|---|---|
| `hyprctl dispatch` | Cursor movement, window focus, workspace switch, close | ~13ms |
| `wlrctl` | Clicks, scroll (Wayland `zwlr_virtual_pointer_v1`) | ~7ms |
| `wtype` | Typing, key combos (Wayland `zwp_virtual_keyboard_v1`) | ~5ms |
| `grim` | Screenshots (JPEG q90 default) | ~65ms |

Pure Wayland. No evdev, no daemon, no coordinate translation.

## Files

- **`desktop.ts`** — Pi extension, registers the `desktop` tool. Install by symlinking to `~/.pi/agent/extensions/`
- **`LESSONS.md`** — Hard-won notes on Hyprland Lua dispatch, coordinate systems, wtype/wlrctl quirks, app interactions
- **`TESTS.md`** — 22 desktop interaction tests of increasing complexity

## Install

```bash
ln -sf $(pwd)/desktop.ts ~/.pi/agent/extensions/desktop.ts
ln -sf $(pwd)/LESSONS.md ~/.pi/agent/notes/desktop-control-lessons.md
```

Then `/reload` in any Pi session.

## Requirements

- Hyprland 0.56+ (Lua dispatch)
- `grim` — Wayland screenshot
- `wtype` — Wayland virtual keyboard
- `wlrctl` — Wayland virtual pointer (`yay -S wlrctl`)

## Actions

| Action | Description |
|---|---|
| `list_windows` | List all windows with address, class, title, geometry |
| `active_window` | Get focused window info |
| `focus` | Focus a window by address or search |
| `screenshot` | Screenshot any window (returns inline JPEG) |
| `type` | Type text into any window |
| `key` | Press keys with modifiers (ctrl/alt/shift/super) |
| `click` | Click at pixel coordinates within a window |
| `scroll` | Scroll at pixel coordinates |
| `close` | Close any window |

Target windows by `window_address`, `search` (class/title substring), or omit both for the focused window.

## Performance

Full file-browser-to-terminal pipeline (switch workspace → click file → copy path → switch back → click terminal → type command → enter):

| Iteration | Time | Change |
|---|---|---|
| v1 ydotool everything | 2620ms | baseline |
| v2 hyprctl cursor + ydotool click | 1187ms | -55% |
| v3 + wlrctl click | 845ms | -68% |
| v4 + wtype keys, drop ydotool | 602ms | -77% |

## Inspired by

- [hypruse](https://github.com/IlyasKhallouki/hypruse) — MCP server for Hyprland computer use. Taught us to use `hyprctl dispatch movecursor` + Wayland virtual pointer instead of ydotool.

## License

MIT
