#!/bin/bash
# usage: ol.sh <tag> [x y w h scale]   -> renders/root/<tag>_ol.png outlines of the 4 children over the input, and the plain render beside it
R=assets-src/model-loop/well_test
T=$1; X=${2:-900}; Y=${3:-30}; W=${4:-1300}; H=${5:-1420}; S=${6:-0.6}
node $R/build/root_outline.mjs $R/renders/root/${T}_ol.png $R/input.png $X $Y $W $H $S deck=$R/renders/root/${T}_sil_deck.png:f0f shaft=$R/renders/root/${T}_sil_shaft.png:0a0 frame=$R/renders/root/${T}_sil_frame.png:00f roof=$R/renders/root/${T}_sil_roof.png:f00
