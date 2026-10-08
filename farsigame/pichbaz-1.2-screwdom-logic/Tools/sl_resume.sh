#!/bin/bash
# sl_resume.sh — resume the 1.2.0 apply after the first run's test_all stopped on core_levels_api (its updated test file
# was missing from the first bundle; the other 34 tests passed on this server with the same content). Steps: run that one
# test -> export APK 1.2.0 (code 10) -> Builds/PichBaz-1.2.0-store.apk -> uplo -> zodita-dev publish (absolute path) -> git commit.
#   bash /root/SycEmpire/Games/PichBaz/Tools/sl_resume.sh 2>&1 | tee /root/SycEmpire/Games/PichBaz/Docs/status/logs/sl_resume.log
set -u
P=/root/SycEmpire/Games/PichBaz
cd "$P" || { echo "SL FAILED: no project dir"; exit 1; }
mkdir -p "$P/Docs/status/logs"
echo "== 4/8 test core_levels_api (resume $(date -u +%m%d-%H%M))"
grep -q 'model_id_of(1) == "blk_s01"' Project/tests/core_levels_api.gd || { echo "SL FAILED: tests/core_levels_api.gd is still the old one"; exit 1; }
GD_TIMEOUT=900 Tools/gd.sh Project "res://tests/core_levels_api.tscn" > Docs/status/logs/sl_rerun2_core_levels_api.log 2>&1
grep -E "^RESULT|^GD_EXIT" Docs/status/logs/sl_rerun2_core_levels_api.log
grep -q "^RESULT PASS" Docs/status/logs/sl_rerun2_core_levels_api.log || { echo "SL FAILED: core_levels_api still failing (see Docs/status/logs/sl_rerun2_core_levels_api.log)"; exit 1; }
echo "tests: ALL PASS (34 in sl_test_all.log + core_levels_api now)"
echo "== 5/8 export 1.2.0 code 10"
Tools/export_apk.sh 1.2.0 10 | tee Docs/status/logs/sl_export.log
grep -q "^EXPORT OK" Docs/status/logs/sl_export.log || { echo "SL FAILED: export"; exit 1; }
cp -f Builds/PichBaz-1.2.0-test.apk Builds/PichBaz-1.2.0-store.apk
ls -la Builds/PichBaz-1.2.0-store.apk
sha256sum Builds/PichBaz-1.2.0-store.apk
echo "== 6/8 uplo"
python3 /root/uploader/agent_box.py send --note "PichBaz 1.2.0 (code 10): Screwdom logic, levels 1-10 rebuilt as big cube structures (every screw on a strap, one per face, hidden holes under cubes), store build (no ads, no IAP)" opus SYC "$P/Builds/PichBaz-1.2.0-store.apk" | tail -3
echo "== 7/8 zodita"
zodita-dev publish pichbaz "$P/Builds/PichBaz-1.2.0-store.apk" | tail -3
echo "== 8/8 git"
git add -A >/dev/null 2>&1
git commit -qm "PichBaz 1.2.0: Screwdom logic for levels 1-10 (cube structures, straps-only screws, one per face, hidden holes under stacked cubes), bigger start view, tests" && git log --oneline -1
echo "SL DONE"
