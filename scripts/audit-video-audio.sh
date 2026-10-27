#!/bin/bash
# Regression check: no quiet/blank 10s window in the final cut.
# Fails if any window mean volume is below -25 dB.
set -u
MP4="${1:-evidence/demo-video/demo-booking.mp4}"
fail=0
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MP4")
echo "duration: ${dur}s"
t=0
while [ "$t" -lt "${dur%.*}" ]; do
  m=$(ffmpeg -hide_banner -ss "$t" -t 10 -i "$MP4" -map a -af volumedetect -f null - 2>&1 | grep -oP 'mean_volume: \S+' | head -1 | grep -oP '\S+$')
  echo "$t-10s mean_volume: $m dB"
  if awk "BEGIN{exit !($m < -25)}"; then fail=1; echo "FAIL: quiet window at ${t}s"; fi
  t=$((t + 10))
done
[ "$fail" -eq 0 ] && echo "AUDIO OK" || echo "AUDIO FAIL"
exit "$fail"
