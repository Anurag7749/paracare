#include "BlinkFSM.h"

BlinkFSM::BlinkFSM()
    : last_raw_state(false),
      debounced_state(false),
      last_debounce_time(0),
      closure_start_time(0),
      is_eye_closed(false),
      emergency_triggered(false),
      blink_count(0),
      window_start_time(0),
      window_active(false) {}

void BlinkFSM::begin() {
    pinMode(PIN_IR_BLINK_SENSOR, INPUT);
    pinMode(PIN_HAPTIC_MOTOR, OUTPUT);
    digitalWrite(PIN_HAPTIC_MOTOR, LOW);
}

bool BlinkFSM::readIRSensor() {
    // ADC or digital read depending on sensor connection
    int analog_val = analogRead(PIN_IR_BLINK_SENSOR);
    return (analog_val < IR_THRESHOLD_CLOSED); // Closed eye reflects/blocks IR
}

const char* BlinkFSM::getCommandString(BlinkCommand cmd) {
    switch (cmd) {
        case CMD_NEED_WATER:    return "NEED_WATER";
        case CMD_NEED_FOOD:     return "NEED_FOOD";
        case CMD_NEED_MEDICINE: return "NEED_MEDICINE";
        case CMD_EMERGENCY:    return "EMERGENCY";
        default:                return "NORMAL_BLINK";
    }
}

void BlinkFSM::triggerHapticFeedback(BlinkCommand cmd) {
    int pulses = 0;
    int duration_ms = 100;

    switch (cmd) {
        case CMD_NEED_WATER:    pulses = 2; break;
        case CMD_NEED_FOOD:     pulses = 3; break;
        case CMD_NEED_MEDICINE: pulses = 4; break;
        case CMD_EMERGENCY:    pulses = 1; duration_ms = 1000; break;
        default: return;
    }

    for (int i = 0; i < pulses; i++) {
        digitalWrite(PIN_HAPTIC_MOTOR, HIGH);
        delay(duration_ms);
        digitalWrite(PIN_HAPTIC_MOTOR, LOW);
        if (i < pulses - 1) delay(100);
    }
}

BlinkResult BlinkFSM::update() {
    BlinkResult result = { false, CMD_NORMAL_BLINK, "NORMAL_BLINK", 0, 0.0f };
    unsigned long now = millis();

    bool raw_state = readIRSensor();

    // Debounce filter
    if (raw_state != last_raw_state) {
        last_debounce_time = now;
    }

    if ((now - last_debounce_time) > DEBOUNCE_MS) {
        if (raw_state != debounced_state) {
            debounced_state = raw_state;

            if (debounced_state) {
                // Eye closed (Blink start)
                is_eye_closed = true;
                closure_start_time = now;
                emergency_triggered = false;
            } else {
                // Eye opened (Blink completed)
                is_eye_closed = false;
                unsigned long duration = now - closure_start_time;

                if (!emergency_triggered && duration < EMERGENCY_HOLD_MS) {
                    blink_count++;
                    if (!window_active) {
                        window_active = true;
                        window_start_time = now;
                    }
                    if (blink_count >= 5) {
                        // 5+ blinks triggers immediate EMERGENCY
                        window_active = false;
                        result.has_event = true;
                        result.command = CMD_EMERGENCY;
                        result.command_str = getCommandString(CMD_EMERGENCY);
                        result.blink_count = blink_count;
                        result.duration_seconds = (float)(now - window_start_time) / 1000.0f;
                        triggerHapticFeedback(CMD_EMERGENCY);
                        blink_count = 0;
                        return result;
                    }
                }
            }
        }
    }

    last_raw_state = raw_state;

    // Check 1: Continuous eye closure >= 3.0s (EMERGENCY SOS)
    if (is_eye_closed && !emergency_triggered) {
        unsigned long current_closure_dur = now - closure_start_time;
        if (current_closure_dur >= EMERGENCY_HOLD_MS) {
            emergency_triggered = true;
            window_active = false;
            blink_count = 0;

            result.has_event = true;
            result.command = CMD_EMERGENCY;
            result.command_str = getCommandString(CMD_EMERGENCY);
            result.blink_count = 1;
            result.duration_seconds = (float)current_closure_dur / 1000.0f;

            triggerHapticFeedback(CMD_EMERGENCY);
            return result;
        }
    }

    // Check 2: Evaluate multi-blink 7-second observation window expiration
    if (window_active && (now - window_start_time >= OBS_WINDOW_MS)) {
        window_active = false;
        BlinkCommand cmd = CMD_NORMAL_BLINK;

        if (blink_count == 2) cmd = CMD_NEED_WATER;
        else if (blink_count == 3) cmd = CMD_NEED_FOOD;
        else if (blink_count == 4) cmd = CMD_NEED_MEDICINE;
        else if (blink_count >= 5) cmd = CMD_EMERGENCY;
        else cmd = CMD_NORMAL_BLINK; // 1 blink

        result.has_event = true;
        result.command = cmd;
        result.command_str = getCommandString(cmd);
        result.blink_count = blink_count;
        result.duration_seconds = (float)OBS_WINDOW_MS / 1000.0f;

        if (cmd != CMD_NORMAL_BLINK) {
            triggerHapticFeedback(cmd);
        }

        blink_count = 0; // Reset for next window
        return result;
    }


    return result;
}
