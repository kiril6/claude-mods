#!/bin/bash
# bash mix.sh <clip dir> <out.mp4> [script.tsv] [video.mp4]: each line at its planned start, or just after the previous one ends.
set -e
dir=$1; out=$2
ins=(); f=""; labels=""; i=0; free=0
while IFS=$'\t' read -r at end text; do
  i=$((i+1)); clip="$dir/$i.wav"; ins+=(-i "$clip")
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$clip")
  start=$(echo "if ($at > $free) $at else $free" | bc -l); free=$(echo "$start + $d + 0.15" | bc -l)
  ms=$(echo "$start*1000/1" | bc); echo "line $i at ${start:0:5}s"
  f="${f}[${i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}];"; labels="${labels}[v${i}]"
done < "${3:-voiceover-script.tsv}"
L=${MUSIC:-music.wav}
video=${4:-pixel-pet-promo.mp4}
len=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")
fade=$(echo "$len - 2.5" | bc -l)
ffmpeg -loglevel error -y -i "$video" "${ins[@]}" -stream_loop -1 -i "$L" -filter_complex \
  "${f}${labels}amix=inputs=${i}:normalize=0,loudnorm=I=-16:TP=-1.5[vo];[$((i+1)):a]aresample=44100,aformat=channel_layouts=stereo,volume=0.18,afade=t=in:d=1.5,afade=t=out:st=${fade}:d=2.5[bed];[vo][bed]amix=inputs=2:normalize=0,atrim=0:${len}[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "$out"
