#ifndef HEALTH_SENSORS_H
#define HEALTH_SENSORS_H

#include <Arduino.h>
#include "config.h"

struct VitalsData {
    float heart_rate;
    float spo2;
    float temperature;
    float battery_percentage;
    const char* wifi_status;
};

class HealthSensors {
public:
    HealthSensors();
    void begin();
    VitalsData readVitals(bool is_wifi_connected);

private:
    float readBatteryPercentage();
    float sampleAnalogTemp();
    float sampleHeartRate();
    float sampleSpO2();
};

#endif // HEALTH_SENSORS_H
