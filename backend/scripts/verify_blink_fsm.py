"""
Standalone verification of blink FSM classification logic.
This script tests the pure logic without requiring Flask/SQLAlchemy dependencies.
"""

# ── Reproduce the FSM constants and logic inline for standalone testing ──

BLINK_WINDOW_SECONDS = 7.0
SOS_HOLD_SECONDS = 3.0
MAX_COMMAND_BLINKS = 4

BLINK_COUNT_COMMAND_MAP = {
    1: "NORMAL_BLINK",
    2: "NEED_WATER",
    3: "NEED_FOOD",
    4: "NEED_MEDICINE",
}

VALID_COMMANDS = {"NORMAL_BLINK", "NEED_WATER", "NEED_FOOD", "NEED_MEDICINE", "EMERGENCY"}

def classify_blink(blink_count, duration_seconds):
    blink_count = int(blink_count) if blink_count is not None else 0
    duration_seconds = float(duration_seconds) if duration_seconds is not None else 0.0

    if (blink_count <= 1) and duration_seconds >= SOS_HOLD_SECONDS:
        return {"command": "EMERGENCY", "is_actionable": True}
    if blink_count >= 5:
        return {"command": "EMERGENCY", "is_actionable": True}
    if 1 < blink_count <= MAX_COMMAND_BLINKS and duration_seconds > BLINK_WINDOW_SECONDS:
        return {"command": "NORMAL_BLINK", "is_actionable": False}
    command = BLINK_COUNT_COMMAND_MAP.get(blink_count, "NORMAL_BLINK")
    return {"command": command, "is_actionable": command != "NORMAL_BLINK"}


def validate_blink_command(command, blink_count, duration_seconds):
    command = (command or '').strip().upper()
    is_valid = command in VALID_COMMANDS
    expected = classify_blink(blink_count, duration_seconds)
    normalized = command if is_valid else expected["command"]
    return {"is_valid": is_valid, "is_consistent": is_valid and command == expected["command"],
            "normalized_command": normalized, "expected_command": expected["command"]}

# ── Test Runner ──

passed = 0
failed = 0

def check(name, condition):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        print(f"  FAIL: {name}")

print("=" * 60)
print("ParaCare Blink FSM Classification Verification")
print("=" * 60)

print("\n-- 1 Blink = NORMAL_BLINK --")
r = classify_blink(1, 0.2);   check("1 blink, 0.2s", r["command"] == "NORMAL_BLINK" and not r["is_actionable"])
r = classify_blink(1, 0);     check("1 blink, 0s", r["command"] == "NORMAL_BLINK")

print("\n-- 2 Blinks within 7s = NEED_WATER --")
r = classify_blink(2, 1.4);   check("2 blinks, 1.4s", r["command"] == "NEED_WATER")
r = classify_blink(2, 7.0);   check("2 blinks, 7.0s (boundary)", r["command"] == "NEED_WATER")
r = classify_blink(2, 0.5);   check("2 blinks, 0.5s (fast)", r["command"] == "NEED_WATER")

print("\n-- 3 Blinks within 7s = NEED_FOOD --")
r = classify_blink(3, 1.8);   check("3 blinks, 1.8s", r["command"] == "NEED_FOOD")
r = classify_blink(3, 7.0);   check("3 blinks, 7.0s (boundary)", r["command"] == "NEED_FOOD")

print("\n-- 4 Blinks within 7s = NEED_MEDICINE --")
r = classify_blink(4, 1.9);   check("4 blinks, 1.9s", r["command"] == "NEED_MEDICINE")
r = classify_blink(4, 1.0);   check("4 blinks, 1.0s (fast)", r["command"] == "NEED_MEDICINE")

print("\n-- 5+ Blinks = EMERGENCY SOS --")
r = classify_blink(5, 1.8);   check("5 blinks is EMERGENCY", r["command"] == "EMERGENCY" and r["is_actionable"])
r = classify_blink(6, 1.5);   check("6 blinks is EMERGENCY", r["command"] == "EMERGENCY" and r["is_actionable"])
r = classify_blink(10, 1.0);  check("10 blinks is EMERGENCY", r["command"] == "EMERGENCY" and r["is_actionable"])

print("\n-- Blinks Outside 7s Window = NORMAL_BLINK --")
r = classify_blink(2, 7.5);   check("2 blinks, 7.5s (outside)", r["command"] == "NORMAL_BLINK")
r = classify_blink(3, 8.0);   check("3 blinks, 8.0s (outside)", r["command"] == "NORMAL_BLINK")
r = classify_blink(4, 7.1);   check("4 blinks, 7.1s (outside)", r["command"] == "NORMAL_BLINK")

print("\n-- Continuous Eye Closure >= 3s = EMERGENCY --")
r = classify_blink(1, 3.0);   check("1 blink, 3.0s (exact SOS)", r["command"] == "EMERGENCY")
r = classify_blink(1, 3.5);   check("1 blink, 3.5s", r["command"] == "EMERGENCY")
r = classify_blink(1, 5.0);   check("1 blink, 5.0s", r["command"] == "EMERGENCY")
r = classify_blink(2, 3.5);   check("2 blinks, 3.5s (within 7s window = NEED_WATER)", r["command"] == "NEED_WATER")
r = classify_blink(1, 2.99);  check("1 blink, 2.99s (NOT SOS)", r["command"] == "NORMAL_BLINK")


print("\n-- Edge Cases --")
r = classify_blink(0, 0);     check("0 blinks, 0s", r["command"] == "NORMAL_BLINK")
r = classify_blink(None, None); check("None, None", r["command"] == "NORMAL_BLINK")
r = classify_blink(2.7, 1.0); check("Fractional blink count", r["command"] == "NEED_WATER")
r = classify_blink(2, -1.0);  check("Negative duration", r["command"] == "NEED_WATER")
r = classify_blink(1, 999.0); check("Very large duration", r["command"] == "EMERGENCY")

print("\n-- Validation Cross-Check --")
v = validate_blink_command("NEED_WATER", 2, 1.4);  check("Valid+consistent", v["is_valid"] and v["is_consistent"])
v = validate_blink_command("NEED_FOOD", 2, 1.2);   check("Valid+inconsistent", v["is_valid"] and not v["is_consistent"])
v = validate_blink_command("DANCE", 3, 1.5);        check("Invalid fallback", not v["is_valid"] and v["normalized_command"] == "NEED_FOOD")
v = validate_blink_command("", 4, 1.8);              check("Empty fallback", v["normalized_command"] == "NEED_MEDICINE")
v = validate_blink_command(None, 2, 1.0);            check("None fallback", v["normalized_command"] == "NEED_WATER")
v = validate_blink_command("need_water", 2, 1.4);   check("Case insensitive", v["is_valid"] and v["normalized_command"] == "NEED_WATER")
v = validate_blink_command("EMERGENCY", 5, 2.0);   check("5 blinks emergency valid+consistent", v["is_valid"] and v["is_consistent"])

print("\n" + "=" * 60)
print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed}")
print("=" * 60)
if failed > 0:
    exit(1)

