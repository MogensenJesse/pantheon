#!/bin/bash
# usage: runall.sh <tagsuffix> -> rebuilds every part with its own round tag (see TAGS), prints QA problems only
cd /d/pantheon/assets-src/model-loop/temple_ruin
while read part tag view; do
  if [ $# -gt 0 ] && [[ " $* " != *" $part "* ]]; then continue; fi
  out=$(bash build/run.sh $part $tag $view 2>&1)
  echo "$out" | python -c "
import sys,json
t=sys.stdin.read()
i=t.find('@@RESULT@@')
if i<0: print('$part FAILED', t[:400]); sys.exit()
d=json.loads(t[i+10:].splitlines()[0])
bad={k:v for k,v in d['qa'].items() if v}
print('$part $tag', 'QA clean' if not bad else json.dumps(bad)[:300], d['dims'] if len(str(d['dims']))<200 else '')
"
  bash build/psheet.sh $part $tag > /dev/null 2>&1
done <<LIST
ashlar r49 35,25,85
wall_block r01 35,25,85
roof_slab r30 35,25,85
roof_slab_m r01 35,25,85
step r32 35,25,85
voussoir r29 35,25,85
boulder r33 35,25,85
rubble r31 35,25,85
pillar r27 35,25,60
stele r25 35,25,85
rafter r40 35,25,60
bargeboard r28 20,10,40
dragon_head r27 35,25,85
moss_clump r32 35,25,85
vine r31 25,15,40
LIST
