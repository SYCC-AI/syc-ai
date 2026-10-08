extends Node
## Levels autoload API test, run against the sample data folders.

const LevelsScript := preload("res://scripts/core/levels.gd")

var fails: int = 0


func _ready() -> void:
	var lv: Node = LevelsScript.new()
	lv.level_dir = "res://tests/data/lv"
	lv.model_dir = "res://tests/data"
	chk("count 70", lv.count() == 70)
	chk("model_id_of 1", lv.model_id_of(1) == "blk_s01")   # 1.2: Screwdom-logic cube levels 1-10
	chk("model_id_of 5", lv.model_id_of(5) == "blk_s05")
	chk("model_id_of 6", lv.model_id_of(6) == "blk_s06")
	chk("model_id_of 70", lv.model_id_of(70) == "blk_giant_cube5")
	chk("band_of 1", lv.band_of(1) == "tutorial")
	chk("band_of 10", lv.band_of(10) == "very_hard")
	chk("band_of 70", lv.band_of(70) == "very_hard")
	var level: Dictionary = lv.load_level(1)
	chk("load_level 1", level.get("model", "") == "gift_box" and level.screws.size() == 6)
	chk("load_level cached", lv.load_level(1) == level)
	var model: Dictionary = lv.load_model("gift_box")
	chk("load_model", model.get("parts", []).size() == 3)
	chk("state from loaded", PuzzleState.from_level(level, model).tap(0).size() == 1)
	chk("plan totals", _plan_ok(lv))
	lv.free()
	print("RESULT PASS" if fails == 0 else "RESULT FAIL n=%d" % fails)
	get_tree().quit(0 if fails == 0 else 1)


func _plan_ok(lv: Node) -> bool:
	for n in range(1, 51):
		var s: int = lv.plan_screws(n)
		var k: int = lv.plan_colors(n)
		if s % 3 != 0 or s / 3 < k:
			return false
	return true


func chk(name: String, ok: bool, why: String = "") -> void:
	if ok:
		print("PASS ", name)
	else:
		fails += 1
		print("FAIL %s: %s" % [name, why])
