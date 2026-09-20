# pi-omarchy-computer-use → moved to [hyprcu](https://github.com/angusforbes/hyprcu)

This repo was the working notebook for building a dialog-free computer-use
tool for Hyprland during Sept 2026. Everything in it now lives in
**[angusforbes/hyprcu](https://github.com/angusforbes/hyprcu)**:

- `LESSONS.md`, `TESTS.md` → `hyprcu/docs/`
- `kev_bench.py`, `kev-serve.sh`, `ttt*.py`, `window_pick.py` → `hyprcu/tools/`
- `desktop.ts` (the Pi extension) → retired; its features (kev natural-language
  targeting, `x_pct`/`y_pct`, training log) are in hyprcu's `pick.py`,
  `pointer`, and `journal.py`

The name was wrong twice over: nothing here needed Pi (hyprcu is an MCP
server + CLI, agent-agnostic), and only three notes were Omarchy-specific.

Archived 2026-09-20. History preserved here; no further changes.
