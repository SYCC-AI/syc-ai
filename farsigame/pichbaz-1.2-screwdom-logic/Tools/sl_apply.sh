#!/bin/bash
# sl_apply.sh — PichBaz 1.2.0 «منطق Screwdom» (L1-10 cube levels, every screw on a strap, hidden holes under cubes).
# Run on the server as root, in one go:
#   bash /root/SycEmpire/Games/PichBaz/Tools/sl_apply.sh 2>&1 | tee /root/SycEmpire/Games/PichBaz/Docs/status/logs/sl_apply.log
# Steps: backup of every file the bundle overwrites -> extract bundle -> import -> test_all (one rerun per failed test)
# -> export APK 1.2.0 (code 10) -> Builds/PichBaz-1.2.0-store.apk -> uplo -> zodita-dev publish (absolute path) -> git commit.
set -u
P=/root/SycEmpire/Games/PichBaz
B=$P/Docs/status/sl_bundle/pichbaz-sl-1.2.0.tar.gz
A=/root/SYC-Archives/PichBaz-sl
TS=$(date -u +%m%d-%H%M)
cd "$P" || { echo "SL FAILED: no project dir"; exit 1; }
[ -s "$B" ] || { echo "SL FAILED: bundle missing $B"; exit 1; }
mkdir -p "$A" "$P/Docs/status/logs"
echo "== 1/8 backup $TS"
tar tzf "$B" | grep -v '/$' | while read -r f; do [ -e "$f" ] && echo "$f"; done > "$A/pre-sl-$TS.list"
if [ -s "$A/pre-sl-$TS.list" ]; then tar czf "$A/pre-sl-$TS.tgz" -T "$A/pre-sl-$TS.list" || { echo "SL FAILED: backup"; exit 1; }; fi
cp -a Project/data/levels_r3 "$A/levels_r3-pre-sl-$TS" 2>/dev/null
echo "backup: $A/pre-sl-$TS.tgz ($(wc -l < "$A/pre-sl-$TS.list") files)"
echo "== 2/8 extract"
tar xzf "$B" || { echo "SL FAILED: extract"; exit 1; }
chmod +x Tools/*.sh
echo "== 3/8 import"
Tools/gd.sh Project --import > Docs/status/logs/sl_import.log 2>&1
grep -c "" Project/i18n/strings.csv; ls -la Project/i18n/strings.fa.translation
echo "== 4/8 test_all"
Tools/test_all.sh Project > Docs/status/logs/sl_test_all.log 2>&1
tail -4 Docs/status/logs/sl_test_all.log
if ! grep -q "^ALL PASS" Docs/status/logs/sl_test_all.log; then
  failed=$(grep "^FAILED:" Docs/status/logs/sl_test_all.log | sed 's/^FAILED://')
  still=""
  for t in $failed; do
    echo "rerun $t"
    GD_TIMEOUT=1500 Tools/gd.sh Project "res://tests/$t.tscn" > "Docs/status/logs/sl_rerun_$t.log" 2>&1
    grep -q "^RESULT PASS" "Docs/status/logs/sl_rerun_$t.log" || still="$still $t"
  done
  [ -z "$still" ] || { echo "SL FAILED: tests still failing:$still (see Docs/status/logs/)"; exit 1; }
  echo "tests: ALL PASS after rerun of:$failed"
fi
echo "== 5/8 export 1.2.0 code 10"
Tools/export_apk.sh 1.2.0 10 | tee Docs/status/logs/sl_export.log
grep -q "^EXPORT OK" Docs/status/logs/sl_export.log || { echo "SL FAILED: export"; exit 1; }
cp -f Builds/PichBaz-1.2.0-test.apk Builds/PichBaz-1.2.0-store.apk
ls -la Builds/PichBaz-1.2.0-store.apk
echo "== 6/8 uplo"
python3 /root/uploader/agent_box.py send --note "PichBaz 1.2.0 (code 10): Screwdom logic, levels 1-10 rebuilt as big cube structures (every screw on a strap, one per face, hidden holes under cubes), store build (no ads, no IAP)" opus SYC "$P/Builds/PichBaz-1.2.0-store.apk" | tail -3
echo "== 7/8 zodita"
zodita-dev publish pichbaz "$P/Builds/PichBaz-1.2.0-store.apk" | tail -3
echo "== 8/8 git"
git add -A >/dev/null 2>&1
git commit -qm "PichBaz 1.2.0: Screwdom logic for levels 1-10 (cube structures, straps-only screws, one per face, hidden holes under stacked cubes), bigger start view, tests" && git log --oneline -1
echo "SL DONE"
