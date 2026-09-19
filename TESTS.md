# Desktop Interaction Tests

20 tests of increasing complexity for the `desktop` extension.
Stack: `hyprctl dispatch` + `wlrctl` + `wtype` + `grim`.

---

## Level 1 — Single actions

### Test 1: List all windows
List every open window and report their workspace, class, and title.

### Test 2: Screenshot the active window
Take a screenshot of whatever window is currently focused and describe what's on screen.

### Test 3: Focus a window by name
Find the Obsidian window and focus it, then confirm by reading the active window.

### Test 4: Type into a terminal
Focus the foot terminal on workspace 1 and type `echo "desktop control works"` then press Enter.

### Test 5: Click a specific pixel
Open the Strata file browser, click on the "Home" entry in the sidebar.

---

## Level 2 — Two-step sequences

### Test 6: Navigate a folder
In Strata, click "Documents" in the sidebar, then screenshot the file list to show its contents.

### Test 7: Switch workspace and screenshot
Switch to workspace 4 (Slack), take a cropped screenshot of just the channel list sidebar, and report what channels are visible.

### Test 8: Right-click context menu
Right-click on a file in Strata, screenshot the context menu that appears, then press Escape to close it.

### Test 9: Scroll a page
Focus the Chromium browser, scroll down 10 steps, then screenshot to show the new position.

### Test 10: Open a new tab
Focus Chromium, press Ctrl+T to open a new tab, then type a URL and press Enter.

---

## Level 3 — Multi-step workflows

### Test 11: Copy text between windows
Open a file in the terminal with `cat`, read a line from the output via screenshot, then type that line into a different terminal.

### Test 12: File browser → terminal pipeline
In Strata, navigate to ~/Work, find any .md file, copy its path, switch to a terminal, and run `wc -l <path>` to count its lines.

### Test 13: Browser form fill
Navigate to a website with a search box (e.g. GitHub), click the search field, type a query, press Enter, and screenshot the results.

### Test 14: Multi-workspace roundtrip
Start on workspace 1. Switch to workspace 5 (Obsidian), screenshot the current note title, switch to workspace 4 (Slack), screenshot the current channel, return to workspace 1. Report both findings without any intermediate screenshots sent to the model — just read them yourself.

### Test 15: Window management
Move the Chromium browser from workspace 1 to workspace 7 using hyprctl dispatch, then verify it moved by listing windows.

---

## Level 4 — Complex interactions

### Test 16: Drag and drop (if supported)
In Strata, try to drag a file from one folder to another using pointer down, move, pointer up sequence.

### Test 17: Multi-tab browser navigation
In Chromium, identify all open tabs by screenshotting the tab bar, click tab 3, screenshot its content, click tab 5, screenshot its content, then report what's in each.

### Test 18: Keyboard shortcut chain
In the terminal: Ctrl+Shift+T to open a new tab (if foot supports it), type `htop` and Enter, wait 2 seconds, press `q` to quit, then type `echo done` and Enter.

### Test 19: Read and act on screen content
Switch to Obsidian, screenshot the current note, read a heading from it, switch to a terminal, and create a new file named after that heading with `touch`.

### Test 20: Full application workflow
Open a new Chromium tab, navigate to google.com, search for "hyprland wayland compositor", screenshot the results, extract the first result title by reading the screenshot, switch to a terminal, and echo that title. Time the entire sequence and report the breakdown.

---

### Test 21: Agent-to-terminal command runner
Receive a list of shell commands from the pi agent (e.g. `uname -a`, `df -h /`, `ip addr show`). Focus a terminal on workspace 1. For each command: type it, press Enter, wait for output, screenshot just the output region, read the screenshot, and collect the results. After all commands complete, return the combined output back to the pi agent as structured text. This tests the full agent→desktop→agent feedback loop — the agent both drives the desktop and reads back from it.

### Test 22: Play tic-tac-toe on Google
Find or open a Chromium browser. Open a new tab, navigate to Google, and search for "tic-tac-toe". Google shows an interactive game widget. Play the game by clicking cells on the board — screenshot after each move to read the board state, plan the next move to win or draw (try not to lose, but no pressure). After the game ends, switch to a terminal and type an ASCII art representation of the final board state, e.g.:
```
 X | O | X
-----------
 O | X | O
-----------
 X | O | X
```
This tests vision-action loops (read board → decide → click), strategic reasoning, cross-app output, and sustained multi-turn interaction with a live web widget.

---

## Scoring

| Grade | Criteria |
|---|---|
| ✅ Pass | Correct result, no retries needed |
| ⚡ Fast pass | Pass in under 2 seconds (excluding model thinking time) |
| 🔁 Retry | Needed a screenshot mid-flow to correct course |
| ❌ Fail | Wrong result or couldn't complete |

## Notes

- Tests assume the current window layout (Strata on ws3, Chromium on ws1/ws7, Obsidian on ws5, Slack on ws4, terminals on ws1)
- Window addresses will need to be resolved at test time via `hyprctl clients -j`
- The `wl-paste` + `wtype` pattern should be used instead of Ctrl+Shift+V for pasting
- Crop screenshots to the smallest useful region
