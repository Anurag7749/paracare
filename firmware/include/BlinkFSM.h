#ifndef BLINK_FSM_H
#define BLINK_FSM_H

#include <Arduino.h>
#include "config.h"

enum BlinkCommand {
    CMD_NORMAL_BLINK,
    CMD_NEED_WATER,
    CMD_NEED_FOOD,
    CMD_NEED_MEDICINE,
    CMD_EMERGENCY
};

struct BlinkResult {
    bool has_event;
    BlinkCommand command;
    const char* command_str;
    int blink_count;
    float duration_seconds;
};

class BlinkFSM {
public:
    BlinkFSM();
    void begin();
    BlinkResult update();
    void triggerHapticFeedback(BlinkCommand cmd);

private:
    bool readIRSensor();
    const char* getCommandString(BlinkCommand cmd);

    bool last_raw_state;
    bool debounced_state;
    unsigned long last_debounce_time;

    unsigned long closure_start_time;
    bool is_eye_closed;
    bool emergency_triggered;

    int blink_count;
    unsigned long window_start_time;
    bool window_active;
};

#endif // BLINK_FSM_H
