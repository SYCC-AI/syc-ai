# PichBaz 1.0.0 test build — FINAL (2026-10-05)

## Screwdom logic 1.2.0 (code 10, store build) — 2026-10-08, cloud session FarsiGamecloud2
The owner's test of 1.1.0 found the first ten levels small, few-pieced and wrongly screwed (several screws behind one part,
3-4 screws on one edge, "hidden" heads that could be seen). Levels 1-10 are rebuilt as big cube structures with the logic
measured on 60 Screwdom cube levels (design + contract: `Docs/design/SCREWDOM_LOGIC.md`; status: `Docs/status/PichBaz_SL.md`;
phone checklist: `Docs/status/OWNER_TEST_1.2.0.md`). Levels 11-70 are byte-identical to 1.1.0; the 1.1 living toys and
their engine (hinge, pop, rotor, key/lock, reactions) stay in the project but leave the catalog.
- Generator `tools/models/defs/_blocks2.gd` (v2): every screw sits on a strap, one strap cell per cube face (one screw per
  edge), a strap on top of a row may run under the cube standing on it (hidden hole; the covering cube gets a blind hole in
  its bottom, so no camera sees the head until that cube has fallen), every hidden hole belongs to its own strap (layered
  reveals, never several heads behind one part), every cube held, every hole screwed (`all_holes`), counts in threes.
  Strap catalogue with Screwdom's weights: edge-bent L (2-3), I2/I3, flat L, square plate, T, +, washer.
- Ten structures blk_s01..s10: 9-83 cubes, 18-159 screws, 0-33 % hidden; grids 3-7 cells (pitch 0.85), the model fills the
  screen width (FIT_WIDTH 0.9), size gate 1.5-6.5 for blk_ models, part-count and "half the parts have sockets" gates off
  for blk_. Collection thumbs rendered, Persian names, one level card per level (L1 tap, L2 tray, L3 hidden screw, L4 layers).
- LevelGen: all-holes mode (the plan takes the structure's count: 18/27/42/57/81/84/102/114/138/159), solver node cap 100k
  during generation, colour-order draw halved for 80+ screws; colours 2/3/3/4/4/4/4/5/4/5 (6 colours never reach a band at
  138 screws under the casual model). Bands: L1 0 %, L2 5 %, L3 16 %, L4 14 %, L5 50 %, L6 48 %, L7 47 %, L8 76 % (hard),
  L9 32 %, L10 91 % (very_hard); no band miss in L1-10.
- Tests adapted: meta_catalog/meta_save/core_levels_api to the new ids, view_special skips hinge/rotor/lock when absent.
- Local test round: 35/35 PASS (int_collection_scroll once loaded 69/70 thumbs under load, PASS alone). Shots: Docs/shots/sl/.
- Server: Tools/sl_apply.sh + sl_resume.sh (hand session FarsiGameHand2): 35/35 PASS, EXPORT OK Builds/PichBaz-1.2.0-store.apk
  (72.9 MB, code 10, sha256 b946f554...), uplo message 129, Zodita ready (pichbaz 1.2.0), server commit 3716663. Bazaar: none.
## Special edition 1.1.0 (code 9, store build) — 2026-10-08, cloud session FarsiGameCloud
The first ten levels are no longer "ten shapes with more screws": each is a LIVING TOY with one new mechanic and reactions
(design + data contract: `Docs/design/SPECIAL_EDITION.md`; status: `Docs/status/PichBaz_SE.md`; phone checklist:
`Docs/status/OWNER_TEST_1.1.0.md`). Levels 11-70 are byte-identical to 1.0.7.
- Mechanics (engine, reusable in later levels): hinge (a part opens and stays; falls with its host), pop (springs up),
  rotor (a part with N states turned by a free tap on the part; the covering set of every head is stored per state),
  key/lock screws (`needs`), reactions (sfx, glow, spin, particles, shake, screen flash, hint, surprise), progress hands.
  Rules: `PuzzleState.apply(a)` (a < 0 = turn rotor -a-1), solver and casual player know the turn; memo key holds rotor states.
- L1 gift box «توش چیه؟» hinged lid + teddy surprise (5 hidden heads) + confetti (24/2 tutorial, fail 2 %);
  L2 alarm clock «زنگ بزن!» progress hands, popping ringing bells (30/3 tutorial, 3 %); L3 unchanged (54/3 easy, 12 %);
  L4 camera «چیز!» popping lens cap + flash + shutter, 4 hidden heads (30/3 easy, 10 %);
  L5 radio «موج رو پیدا کن» turning dial (rotor, 4 states, window over 4 plate heads), grille → radio on (42/4 normal, 42 %);
  L6 cottage «در رو باز کن» hinged door + 4 shutters, cat surprise, lit windows, chimney smoke (42/4 normal, 53 %);
  L7 cake «شمع‌ها رو فوت کن» golden key star → 3 locked candles, smoke (36/4 normal, 40 %);
  L8 lantern «روشنش کن» rotor crown over 4 shelf heads, screens → brighter drum (39/4 normal, 44 %);
  L9 robot «بیدار شو» key on the back → locked hinged hatch → battery surprise, waving arms, lit face (39/4 normal, 44 %);
  L10 car «استارت بزن» hinged hood + trunk (engine, suitcase), horn + spinning wheels, smoke (42/4 very_hard, dock 3, 95 %).
- HUD: a level card (icon, title, one line) opens L1-10 and goes at the first tap; flash overlay, surprise banner, lock/hint toasts.
- Boot: «SYC ▸ ZODITA» vector intro (~2 s, tap to skip) before the loading screen; the same scene rendered with
  `--write-movie` is the Zodita intro video (`Projects/Zodita/intro/zodita_intro_1080x1920.mp4`).
- 21 new synthesized sounds (`Tools/se_sfx.py`), 9 rebuilt models (all gates PASS), `view_special` test added, replay tests
  use `apply`/`bot_apply`, `int_boot` expects the intro (home within 4.5 s).
- Model lessons: a `box` keeps an automatic bevel (a quarter of its smallest side) so small parts take no head → `extrude(rrect)`
  with an explicit bevel; small cylinders take no side heads → many-sided `frustum`; a profile with notches does not
  triangulate → several simple closed shapes; under the owner's visibility rule a rotor needs a skirt and radial walls
  (radio dial, lantern crown) or a flat camera peeks under its rim; anchors 7° off the cap's fan edges; coincident faces
  fool the overlap gate (0.01 gap).
- Server apply: `Tools/se_apply.sh` with `Docs/status/se_bundle/pichbaz-se-1.1.0.tar.gz` (backup → extract → import →
  test_all → export 1.1.0 code 9 → `Builds/PichBaz-1.1.0-store.apk` → uplo → zodita-dev publish → commit). Nothing goes to
  Bazaar (owner's rule).
- Local test round (cloud copy, headless + xvfb): 33 tests, all PASS except four that passed when run alone and failed only
  because of the local copy (`core_levels_all`: levels table not at the server path; `int_collection_scroll`: timing test
  under three parallel Godot processes; `view_sfx`: `default_bus_layout.tres` missing from the copy; `view_special`: a hinged
  part was freed at bot speed, fixed: it now opens instantly and stays). Logs: `Docs/status/logs/se_test_all_cloud.log`,
  `se_core_levels_all_cloud.log`, `se_fix_tests_cloud.log`. The server round (`se_apply.sh`) runs the full suite before the APK.


## Fix round 4 (1.0.5, code 6, uplo msg 113)
Signed with the same release key (SHA-256 37c552fa…8966, apksigner OK), 59.7 MB, published with `zodita-dev publish pichbaz` after the uplo upload. Tests: meta 8, core 7, int 4, kit 1, view 14 all PASS (helpers view_perf/view_perf2/view_hang_shot are measure tools, skipped by test_all).
- Lane 20 (items 1, 2): racks (colour boxes + dock) face the screen; fall lag fixed (collider cost moved to level load, falling bodies bounded, input watchdog); release cost ~200x lower.
- Lane 23 (items 4, 6): collection scroll works with touch drag; 3 composed music tracks rotate.
- Lanes 21/24 (items 3, 5, 11, 13, 14, 16-part): visibility screw rule (a visible screw is always removable, a hidden one is not; L9 robot feet fixed); no model overlaps (70/70 models 0 pairs); more screws per model (L1 15 … L35 78) and harder bands; L1-35 regenerated.
- Lane 22/25 (items 5, 11, 13 for L36-L70): all 35 models overlap-free, 60-108 screws, hoods; levels regenerated, core_levels_all PASS (listed misses L60, L70).
- Lane 27 (items 9, 12-pivot, 16): a part left on one screw swings around it like a pendulum; smoother fly/fall and soft sounds; merged into this build.
- Lane 26 (items 8, 10): new PichBaz logo (Lalezar OFL, no outline); loading screen with natural gradient sky + soft clouds, our biplane and real threaded 3D screws rendered natively (no stroke/outline anywhere), preloads home/game/win/collection one scene per frame, min 1.2 s, no wait in tests; animated win screen (confetti, logo, «آفرین!», star, coins flying to a counting gold counter, ×2 ×3 ×5 ×3 ×2 bar with a sweeping arrow, rewarded-ad button «تبلیغ ببین و ×N بگیر», delayed plain «ادامه»); base gold paid once, the ad pays only the rest (Game.claim_win_multiplier, no double grant). Shots Docs/shots/PichBaz_26/.
- Not in this round (wave 2): the 25 wooden levels L71-L95 and spreading wooden levels among model levels (items 12-levels, 15).
- Known: real frame rate / feel on the phone is for the owner to judge.

## Fix round 2 (1.0.3, code 4, uplo msg 105)
- Theme "Royal Jewels": emerald/sapphire/amethyst + gold across menus, buttons, popups, 3D backdrops per chapter (PichBaz_6 / PichBaz_7); rounder glossy models and vivid colors (PichBaz_6).
- Physics fall (PichBaz_5): each part has a StaticBody3D collider; a released part becomes a RigidBody3D that hits the other parts, slides/tumbles off and is freed the moment it is fully off screen (no fade). Resting parts get kicked off, then fall through. Skipped at anim_speed >= 5 (tests/bot).
- Sounds: part_fall is now 3 soft CC0 Kenney Impact Sounds variants (-12 dBFS), played only on first contact, volume by impact speed, 120 ms throttle; harsh synths (unscrew, box_done, booster) low-passed; all SFX normalized to -6 dBFS peak (Tools/l5_sfx.sh).
- Tests: test_all ALL PASS (23, includes new view_fall, also PASS windowed 540x1200). Shots: Docs/shots/PichBaz_5/ and final/.
- Known limit: frame rate and feel of the physics on the phone are for the owner to judge.

## Fix round 1
- Cause: router root Control in main.gd kept MOUSE_FILTER_STOP and swallowed every press before GameView._unhandled_input. Fixed (IGNORE). Tutorial hand now follows the screw each frame.
- New tests/int_input.tscn drives the real main scene with injected touch+mouse (headless, 540x1200, 1080x2400); failed on old main.gd, passes now. No x-ray double grant (meta_flow intro_once checks added).
- 1.0.1 (input fix only, uplo msg 102) and 1.0.2 (new sky + colors from PichBaz_6, uplo msg 103). test_all ALL PASS (22).

## What is in the build
- Offline portrait 3D screw-sort puzzle, 50 levels on 10 models (gift_box … rocket), 5 bands from tutorial to very_hard.
- Persian RTL UI (Vazirmatn, Persian digits): splash, home, game + HUD, tutorial (L1–3), win/fail/pause popups,
  shop, daily reward (7 days), collection (10 models), settings, season end after L50.
- Boosters: extra dock slot (intro L4), hammer (L8), x-ray (L12). Interstitial every 3 levels from L9 (mock), rewarded mock ads, mock banner.
- Ads and billing run in **mock** mode (`store.cfg`: `test_build=true`, both backends `mock`). Adivery and Poolakey plugins are merged into the APK and ready.
- Sounds: 11 SFX + 1 music loop, all synthesized by our own script. No third-party art.

## Gate results
- G1 core (PichBaz_1): 50 levels valid, solutions replay to won, 0 BAND MISS, byte-identical regeneration — core_* PASS.
- G2 view (PichBaz_2): bot wins 50/50 at anim_speed 20, max level load 0.16 s — view_* PASS.
- G3 meta (PichBaz_3): save, ad rules, mock billing, flow L1–12 — meta_* PASS.
- G4 build (PichBaz_4): `Tools/test_all.sh Project` → **ALL PASS (21 tests)**, including `int_bot_all` (50/50 won in 72.7 s + L9 fail → continue → win) and `int_boot` (home in 1.4 s).
- Performance (540×960 software render, mid-play): L10 57 draw calls / 7 860 prims, L30 93 / 14 816, L50 104 / 17 480 (budget 120 / 60 000). Shots: `Docs/shots/PichBaz_4/perf/`, final set `Docs/shots/PichBaz_4/final/`.

## APK
- Path `Builds/PichBaz-1.0.0-test.apk`, **52 MB** (limit 80), package `ir.sycc.pichbaz`, version 1.0.0 / code 1, min SDK 24, target SDK 36, ABIs arm64-v8a + armeabi-v7a.
- Signed with the release key `keys/pichbaz-release.jks` (alias `pichbaz`, SHA-256 37:C5:52:FA:…:8E:89:66). `apksigner verify` OK (v2 scheme). Backup of the key + pass: `/root/SYC-Archives/PichBaz-keys/` (mode 600). The same key must sign every future update.
- APK holds 50 level JSON, 10 model JSON, `config/store.cfg`, fonts, translation. Merged manifest has `GodotAdivery`, `GodotPoolakey`, Bazaar billing receiver + `PAY_THROUGH_BAZAAR`.
- Uploaded once to uplo (owner mailbox): **message id 101**.

## Known limits
- The plugins (Adivery, Poolakey) and the real-store paths could not be run on a device here (no emulator allowed). Verified: manifest merge, and every godot-lib API the AARs call exists in 4.7.2. Poolakey was built for 4.5, no rebuild needed.
- `Verified using v3 scheme: false` — the APK is v2-signed; fine for min SDK 24 and Bazaar. Native libs are compressed (`compress_native_libraries=true`), so no 16 KB page-size alignment (not needed outside Google Play).
- Software-render shots only; real-device frame rate is for the owner to judge (OWNER_TEST row 10).
- `view_all_levels` has a load-time check (≤ 0.5 s) that can flake when the server load is above ~25.
- Adivery's own SDK (`com.adivery:sdk:4.9.0`) is proprietary Maven code pulled at build time (ledger row in `Docs/ASSETS.csv`).

## What the owner must supply for the real release
1. **Adivery** publisher account: app id + 3 placement ids (rewarded, interstitial, banner).
2. **Cafe Bazaar** developer account: the RSA public key and these 6 products with exactly these ids
   (non-consumable: `pb_starter`, `pb_noads`; consumable: `pb_coins_s`, `pb_coins_m`, `pb_coins_l`, `pb_boosters`).
   Prices to enter (Toman): 49 000 / 59 000 / 19 000 / 59 000 / 129 000 / 39 000.
3. Optional: a support link for `support_url`.

## Switch to real ads/billing and rebuild (one command)
Edit `/root/SycEmpire/Games/PichBaz/Project/config/store.cfg`:
```
[general]  test_build=false
[ads]      backend="adivery"  adivery_app_id="<id>"  placement_rewarded="<id>"  placement_interstitial="<id>"  placement_banner="<id>"
[billing]  backend="bazaar"   bazaar_rsa="<RSA public key>"
```
Then: `cd /root/SycEmpire/Games/PichBaz && Tools/export_apk.sh 1.0.1 2` → `EXPORT OK Builds/PichBaz-1.0.1-test.apk <MB>` (the file name keeps "-test"; rename it before publishing). If a backend's plugin or key is missing, the game logs it and falls back to `none` (no ads / no purchases) instead of crashing.

## Fix round 3 (1.0.4, code 5)
- 70 levels, 70 models (`data/models_r3`, `data/levels_r3`); a new model every level, L51-L70 are the cube-and-strap `blk_*` models. Old `data/models` and `data/levels` removed.
- One geometry truth: `MeshRays` (physics rays on the real part meshes) decides seating, clearance (0.03), 9-ray blocking and head visibility, in tools, generator and game.
- Holding logic: a screw pins its own part plus parts its shank passes (`SHANK_LEN = 0.13`); a part falls only when no remaining screw pins it (`pins` in level JSON).
- Cover/visibility rule: the generator drops uncovered sockets not visible at level start from every game camera distance (`SocketGen.visible_at_start`, START_DISTS).
- `blk_bridge` reworked (seed 24) because a strap was pruned by a cover cycle and left a part unpinned; L58 now generates.
- `build_models` round-trips each model through the 0.001 JSON writer before sockets (fixes the oracle flake).
- Hammer uses the X-ray glass shader; zoom 1.0-2.6x (pinch, pan, wheel, slider); gold padlock; new icons and thumbs.
- Test notes: `view_all_levels` load gate raised 0.5 s to 2.0 s (CPU is about 0.2 s per level; wall time triples under server load; the old 0.5 s gate was a load artefact). `view_reach` now waits two physics frames after `start_level` (colliders enter the physics space then). `view_fall` keeps its real-time cap and is flaky only under heavy load.
- Final gate: `Docs/status/logs/11_test_all3.log` ALL PASS (29 tests). Perf at 540x1200: L10 68 dc / 42.5k prims, L50 98 / 48k, L70 131 / 62.8k (budget 150 / 120k). No level missed its band; no model fallbacks.
- Shots: `Docs/shots/PichBaz_11/final/`. APK `Builds/PichBaz-1.0.4-test.apk`, uplo message 107, zodita-dev published.

## Round Fab (1.0.7 store, code 8) — screw placement rebuilt from the Screwdom study (GameFarsiFab/GameFarsi3 brain)
- Study: Screwdom 13.4.3 installed and played on Kinj's emulator; all 536 level prefabs parsed from the APK (Ref/screwdom,
  levels_stats.csv). Cube levels = 1x1 cubes on a grid, a fixed strap catalogue (bar 2/3, L, T, plus, 2x2 plate, washer, edge-bent
  L) with one hole per covered cell, peeled layer by layer; model levels = many small parts with 1-3 symmetric screws each.
- Models: SocketGen now puts heads on PATTERNS (face centre, both ends of a bar, grids of 2-6 x 1-3 at 0.36 pitch, rings on caps,
  the fixed holes of straps) instead of a free sampling grid; every socket carries a pattern id and a role (end / middle / hidden).
  Parts no head seats on are pinned through a neighbour's head (helicopter hump by the rotor).
- Block levels L51-L70 rewritten: 25-98 cubes (was 8-27 merged blocks), about one strap per cube, straps only on faces that look
  out, hidden heads in the gap on the deeper cube of a pair (covered by the cube in front: Screwdom layers), low-poly cubes
  (108 tris each), no service caps. 20/20 pass the model gates.
- Levels: the generator screws whole patterns (both ends of a strap, all corners of a plate), pins the most constrained parts first,
  takes the screw count from what the model offers (70 levels, 4122 screws; blocks average 82, objects 50), band miss only L55.
- Shots: Docs/shots/fab/ (per level + 4 contact sheets). Old data archived in /root/SYC-Archives/PichBaz-fab/pre_fab_data/.
- Store: same store.cfg as 1.0.6 (test_build=false, ads none, billing none).

## Round 5 (1.0.6 store, code 7) — quality round, shipped by the GameFarsi2 brain
- Lanes 28-33 (Opus) merged into Project: bright Persian home + glossy theme, balloon loading screen, no text/shape outlines (28);
  15 new models L36-L50 (29); hoods take the colour of their part, swept-ray swing contact, windmill L16 (30); Screwdom-like HUD:
  toy boxes, slim dock, counter, level strip, booster bar with unlock labels, puffy win star (31); 6 new licensed music tracks,
  13 soft SFX, real wood grain + pastel straps L51-70, credits (32); hand-made L1-L5 + onboarding hints (33).
- Brain fixes after the lanes: booster badges round with a white rim, centred on the tile corner (clear of the icon); helicopter L15
  rebuilt (helipad with H, silver skis, two-layer rotor) and UFO L35 rebuilt (16-sided saucer, wide white flare, no ramp); both levels
  regenerated (L15 hard 66 %, L35 hard 78 %), thumbs re-rendered; meta_save expectations updated for the new L5 model (retro_radio);
  settings shows the real version (project.godot config/version, synced by export_apk.sh).
- Not done: steam locomotive L27 rework (fails the socket gate; WIP in Docs/shots/r5_30/wip), helicopter/elephant/tractor/
  dinosaur/excavator/school bus untouched except the helicopter; swing creak sound.
- Tests: full test_all once in Project (35 run: 33 PASS, meta_save stale expectation fixed, meta_win_mult flaky under load → PASS
  on rerun); after the brain merge reran meta_save, meta_win_mult, meta_catalog, meta_screens, core_models_r3, core_levels_all,
  core_levels_api, view_boosters, view_reach, view_truth, int_bot_all, int_input: ALL PASS.
- Store: store.cfg test_build=false, ads backend none, billing backend none. Posters Docs/store/shots/pichbaz-1..3.jpg (home,
  helicopter L15, Azadi tower L41). Backup of replaced files: /root/SYC-Archives/PichBaz_r5_brain_pre_merge/.
