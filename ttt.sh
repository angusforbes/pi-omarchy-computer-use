#!/bin/bash
# Tic-tac-toe helper — uses window-relative percentages, not absolute pixels.
# Usage: ttt.sh <command> [args]
#   setup          — find/launch Chromium, open tictactoe tab, return window info
#   click <r> <c>  — click cell (1-3, 1-3) using percentages
#   restart        — click Restart game
#   shot [name]    — screenshot the board area
#   score          — screenshot the score area

# Board geometry as FRACTIONS of the Chromium window.
# Measured from a 1416x850 window: the teal board is at ~y 44%-76%, x 11%-56%.
# Grid cells within the board:
BOARD_X0=0.245   # left edge of playable grid (fraction of window width)
BOARD_X1=0.415   # right edge
BOARD_Y0=0.49    # top of grid
BOARD_Y1=0.72    # bottom of grid
RESTART_Y=0.78   # "Restart game" button
RESTART_X=0.33

win_info() {
  hyprctl clients -j | python3 -c "
import json,sys
for c in json.load(sys.stdin):
    if c['class']=='chromium' and 'tictactoe' in c['title'].lower():
        print(f\"{c['address']} {c['at'][0]} {c['at'][1]} {c['size'][0]} {c['size'][1]}\")
        break"
}

pct_to_logical() {
  # args: xpct ypct → prints "x y" in logical coords
  local xp=$1 yp=$2
  read -r ADDR WX WY WW WH <<< "$(win_info)"
  if [ -z "$ADDR" ]; then echo "ERROR: no tictactoe window"; return 1; fi
  python3 -c "print(f'{int($WX + $xp * $WW)} {int($WY + $yp * $WH)}')"
}

cell_pct() {
  # args: row col (1-3) → prints "xpct ypct"
  local r=$1 c=$2
  python3 -c "
bx0,bx1,by0,by1 = $BOARD_X0,$BOARD_X1,$BOARD_Y0,$BOARD_Y1
cw=(bx1-bx0)/3; ch=(by1-by0)/3
x=bx0 + cw*($c-1) + cw/2
y=by0 + ch*($r-1) + ch/2
print(f'{x:.4f} {y:.4f}')"
}

focus_game() {
  read -r ADDR _ <<< "$(win_info)"
  if [ -z "$ADDR" ]; then echo "ERROR: no tictactoe window"; return 1; fi
  hyprctl dispatch "hl.dsp.focus({window = \"address:$ADDR\"})" >/dev/null
  sleep 0.15
}

case "$1" in
  setup)
    read -r ADDR WX WY WW WH <<< "$(win_info)"
    if [ -z "$ADDR" ]; then
      echo "No tictactoe tab. Opening one..."
      CHROME=$(hyprctl clients -j | python3 -c "
import json,sys
for c in json.load(sys.stdin):
    if c['class']=='chromium':
        print(c['address']); break")
      if [ -z "$CHROME" ]; then
        hyprctl dispatch 'hl.dsp.exec_cmd({cmd = "chromium"})' >/dev/null
        sleep 3
        CHROME=$(hyprctl clients -j | python3 -c "
import json,sys
for c in json.load(sys.stdin):
    if c['class']=='chromium':
        print(c['address']); break")
      fi
      hyprctl dispatch "hl.dsp.focus({window = \"address:$CHROME\"})" >/dev/null
      sleep 0.3
      wtype -M ctrl -k t -m ctrl; sleep 0.6
      wtype "tictactoe"; wtype -k Return; sleep 2.5
      read -r ADDR WX WY WW WH <<< "$(win_info)"
    fi
    echo "window=$ADDR at=($WX,$WY) size=${WW}x${WH}"
    ;;
  click)
    focus_game || exit 1
    read -r xp yp <<< "$(cell_pct $2 $3)"
    read -r x y <<< "$(pct_to_logical $xp $yp)"
    hyprctl dispatch "hl.dsp.cursor.move({ x = $x, y = $y })" >/dev/null
    sleep 0.03; wlrctl pointer click
    echo "clicked [$2,$3] at pct($xp,$yp) → logical($x,$y)"
    ;;
  restart)
    focus_game || exit 1
    read -r x y <<< "$(pct_to_logical $RESTART_X $RESTART_Y)"
    hyprctl dispatch "hl.dsp.cursor.move({ x = $x, y = $y })" >/dev/null
    sleep 0.03; wlrctl pointer click
    echo "restart clicked at ($x,$y)"
    ;;
  shot)
    focus_game || exit 1
    read -r ADDR WX WY WW WH <<< "$(win_info)"
    read -r x0 y0 <<< "$(pct_to_logical $BOARD_X0 $BOARD_Y0)"
    read -r x1 y1 <<< "$(pct_to_logical $BOARD_X1 $BOARD_Y1)"
    # Add margin
    x0=$((x0-40)); y0=$((y0-30)); w=$((x1-x0+80)); h=$((y1-y0+60))
    grim -s 1 -g "$x0,$y0 ${w}x${h}" -t jpeg -q 85 "/tmp/ttt-${2:-board}.jpg"
    echo "/tmp/ttt-${2:-board}.jpg"
    ;;
  score)
    focus_game || exit 1
    read -r x0 y0 <<< "$(pct_to_logical 0.18 0.36)"
    read -r x1 y1 <<< "$(pct_to_logical 0.50 0.42)"
    grim -s 1 -g "$x0,$y0 $((x1-x0))x$((y1-y0))" -t jpeg -q 85 /tmp/ttt-score.jpg
    echo "/tmp/ttt-score.jpg"
    ;;
  *)
    echo "usage: ttt.sh setup|click r c|restart|shot [name]|score"
    ;;
esac
