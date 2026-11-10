#!/usr/bin/env bash
# Delivery checks for a finished MP4: streams, duration, loudness, black frames, silence, sidecars.
#   factory/qa.sh out/<slug>.mp4
set -euo pipefail
f="$1"
echo "== streams"
ffprobe -v error -show_entries stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames,sample_rate,channels,duration -of compact=p=0:nk=0 "$f"
ffprobe -v error -show_entries format=duration,size,bit_rate -of compact=p=0:nk=0 "$f"
echo "== loudness (EBU R128)"
ffmpeg -hide_banner -nostats -i "$f" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|LRA|Peak):" | tail -3
echo "== black frames (>0.5 s)"
ffmpeg -hide_banner -nostats -i "$f" -vf blackdetect=d=0.5:pix_th=0.05 -an -f null - 2>&1 | grep blackdetect || echo "none"
echo "== silence (>1.5 s below -45 dB)"
ffmpeg -hide_banner -nostats -i "$f" -af silencedetect=n=-45dB:d=1.5 -vn -f null - 2>&1 | grep -E "silence_(start|end)" || echo "none"
echo "== sidecars"
for e in srt vtt; do s="${f%.mp4}.$e"; [ -f "$s" ] && echo "$s: $(grep -c -- '-->' "$s") cues" || echo "$s: MISSING"; done
