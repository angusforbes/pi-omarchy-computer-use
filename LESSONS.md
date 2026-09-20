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

Tool-result image blocks are **flat**, per `docs/session-format.md`:
```typescript
{ type: "image", data: base64String, mimeType: "image/jpeg" }
```
NOT `{type:"image", source:{type:"base64", mediaType, data}}` — that's the
Anthropic wire format, and it's what `docs/extensions.md` line ~1450 shows for
`sendUserMessage`, which is misleading. Using it in a tool result throws
`The first argument must be of type string, Buffer...` deep in pi's
attachment handling. Cost two separate debugging sessions.

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

## 12. Window addresses go stale — never cache them

Hyprland window addresses are heap pointers. When the user closes and
reopens an app, the address changes. Terminal `0x55a673286d30` became
`0x561283a7ce40` after a close/reopen. **Always re-query `hyprctl clients -j`
at the start of each action sequence.** Never hardcode or carry addresses
across turns.

Also: windows move between workspaces. The terminal was on ws1, then ws2.
Query by class+title, not by remembered workspace.

## 13. Percentages vs anchored offsets

Window-relative percentages (x_pct/y_pct) work for **layout that scales with
the window** (a webpage that reflows, a maximized app). They **break** for
fixed-size elements centered in a variable-width container.

Google's tic-tac-toe grid is a fixed 210×210px square inside a 650px-wide
results card. At window width 1416 the card is at x=150; at 701 it's at x=8.
The grid center moves, but the cell spacing (70px) does not.

**Pattern:** find a locatable anchor (card center, a known button), then use
fixed pixel offsets from it. `ttt.sh` does: `grid_center()` → `cx + (col-2)*70`.

## 14. Idle inhibitor for long test runs

`systemd-inhibit --what=idle --who=Grip --why="testing" --mode=block sleep 1800 &`
Blocks the screensaver for 30 min. `movecursor` dispatches also count as
activity, but long think-pauses between actions can trigger idle.

## 15. Google Tic-Tac-Toe (Medium) — solved

The Medium AI is deterministic. Winning sequence as X (0-indexed r,c):
1. [2,2] center → O plays [2,3]
2. [1,1] corner → O plays [3,3]
3. [1,3] block → O plays [3,1]
4. [1,2] → **X wins top row**

~0.9s between moves is the minimum; 0.7s and the second click is swallowed
by O's animation. 4 moves ≈ 3.5s blind. `ttt.sh` has the full flow.

## 16. Fast tic-tac-toe: pixel reader + minimax (ttt_fast.py)

`ttt_fast.py --no-model` plays a full game in **5.1s with zero LLM calls**:
- grim crop of board: 40ms
- pixel-sample 9 cells (ring of 12 points at r=18 + center + diagonals): <5ms
- minimax: 0-4ms
- click via ttt.sh: 240ms
- wait for O's animation: 900ms
Per turn ≈ 280ms + 900ms wait.

**O is a hollow ring** — sampling only the cell center reads teal (empty).
Must sample a ring of points at the O's radius. Cost me a 2,300-iteration
infinite loop before I added `max_turns` and stale-board detection.

**Always guard autonomous loops**: max iterations + "did the state change
after my action?" check. If not, screenshot and bail.

## 17. OpenDecision is the wrong tool for game moves

OpenDecision (ModernBERT-large zero-shot NLI, ~400M):
- GPU first call: **61s** (triton JIT). Warm: **80ms**. CPU: **8s/call**.
- Picked the wrong tic-tac-toe cell every time, even with "(WINS immediately)"
  in the option text. It's text-similarity, not reasoning.

Use it for **classification** ("which window is the file browser?", "is this
a dialog or a page?"), not for anything needing lookahead. For deterministic
games, compute the move; for judgment, use Claude.

## 18. OpenDecision for window selection — also wrong tool

Tried `window_pick.py`: describe each open window as text, ask OpenDecision
"which matches the user's request?". Results on 6 open windows:

| Query | OpenDecision | Correct? |
|---|---|---|
| "Claude Code" | tie 0.31 between "Claude Code" and "tictactoe" | ✗ |
| "the tic tac toe game" | ranked "tictactoe" 3rd at 0.15, behind two terminals | ✗ |
| "the AI agent pane" | NONE (0.32) | ✗ |
| "a terminal" | foot ✓ | ✓ |

Near-uniform ~0.31 across options = the model can't discriminate. It's an
NLI model (premise entails hypothesis?) trained on full sentences; short
labels, proper nouns, and concatenated tokens ("tictactoe") defeat it.

A 20-line token-overlap matcher beat it on 2 of 4 hard cases at 0.1ms.

**Conclusion:** zero-shot NLI ≠ decision model. For "pick from N labeled
options", either compute it (string match, minimax) or use something trained
for calibrated choice (Jev/RLCD). Cold start (61s GPU triton JIT) also
makes OpenDecision impractical as an on-demand sidecar.

Next: try Jev API on the same window_pick queries. If it nails them, wire it
in behind a confidence gate; below the gate, fall through to Claude.

## 19. kev-4b: the fast model that actually works (window selection 9/9)

[kev](https://github.com/jaredpalmer/kev) = Qwen3 + LoRA + pointer head, trained
supervised on choice-from-options. Jev-compatible `/v1/systemone`. Local.

| model | window-pick accuracy | warm latency | VRAM | notes |
|---|---|---|---|---|
| OpenDecision (NLI) | ~30% | 80ms | 1.5GB | near-uniform probs, 61s cold start |
| kev-0.6b fp32 | 5/8 | 77ms | 1.5GB | overconfident on wrong answers |
| **kev-4b NF4** | **9/9** | **173ms** | **3.6GB** | well-calibrated: matches 0.57–1.0, non-matches 0.26–0.43 |

**Setup gotchas (cost ~1 hour):**
- `HF_HUB_DISABLE_XET=1` — hf-xet transfer backend hangs silently with zero output.
  Every HF download on this machine needs it.
- kev-4b bf16 = 7.45GB, OOMs on the 8GB card by 48MB. Patched kev to support
  `KEV_QUANT=nf4` (bitsandbytes 4-bit): 3.6GB, loads in 60s. Patch is in
  ~/Work/kev (model.py + evaluate.py), 12 lines. Should upstream.
- `pgrep -f "kev.serve"` matches your own bash -c wrapper. Use
  `ps aux | grep "[m] kev.serve" | grep -v "bash -c"`. I spent 20 minutes
  debugging a "hung server" that was my own diagnostic shell.
- Launch via a script file with `nohup script.sh > log &`. Inline
  `nohup VAR=x cmd &` and `setsid` both lost env/redirects in this harness.

**Do NOT add an explicit "none of these" option.** Both sizes treat it as a
probability sink and start refusing real matches (4b: 9/9 → 6/9). Instead use
the calibration: gate at p ≥ 0.5, fall through to Claude below it. Below-gate
is also the signal that the app may need launching.

Start: `./kev-serve.sh` (in this repo). Bench: `python3 kev_bench.py`.
