#!/bin/sh
# usage: level.sh <Alignment> <Impact> <Verification> <Rollback> <Errors>
# Each verdict is ⚠️ (3), 👀 (2) or ✅ (1). Prints low, medium or high.
# Weights: Impact and Verification 2, Rollback 1.5, Alignment and Errors 1.
[ $# -eq 5 ] || { echo "usage: level.sh <Alignment> <Impact> <Verification> <Rollback> <Errors>" >&2; exit 2; }
sum=0
# Weights are doubled to stay in integers; the weighted mean is sum / 15.
for w in 2 4 4 3 2; do
  case $1 in ⚠️|⚠) n=3 ;; 👀) n=2 ;; ✅) n=1 ;; *) echo "not a verdict: $1" >&2; exit 2 ;; esac
  sum=$((sum + n * w)); shift
done
if [ $((sum * 2)) -lt 45 ]; then echo low
elif [ $((sum * 4)) -lt 135 ]; then echo medium
else echo high; fi
