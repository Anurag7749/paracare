#include "HealthSensors.h"

HealthSensors::HealthSensors() {}

void HealthSensors::begin() {
    pinMode(PIN_BATTERY_ADC, INPUT);
    pinMode(PIN_TEMP_SENSOR, INPUT);
    // Wire.begin(PIN_SDA, PIN_SCL); // I2C setup for MAX30102
}

float HealthSensors::readBatteryPercentage() {
    int raw = analogRead(PIN_BATTERY_ADC);
    // Voltage divider scaling placeholder (3.3V max ADC on ESP32)
    float voltage = (raw / 4095.0f) * 2.0f * 3.3f;
    float pct = ((voltage - 3.2f) / (4.2f - 3.2f)) * 100.0f;
    if (pct > 100.0f) pct = 100.0f;
    if (pct < 0.0f) pct = 0.0f;
    return (pct == 0.0f) ? 88.5f : pct; // Default mock fallback if pin unattached
}

float HealthSensors::sampleAnalogTemp() {
    int raw = analogRead(PIN_TEMP_SENSOR);
    // Placeholder conversion for LM35/NTC analog sensor
    float temp = 36.5f + (raw % 15) * 0.1f;
    return temp;
}

float HealthSensors::sampleHeartRate() {
    // Placeholder MAX30102 / PPG reading logic
    return 76.0f + (random(0, 100) * 0.1f);
}

float HealthSensors::sampleSpO2() {
    // Placeholder MAX30102 SpO2 reading logic
    return 97.5f + (random(0, 20) * 0.1f);
}

VitalsData HealthSensors::readVitals(bool is_wifi_connected) {
    VitalsData data;
    data.heart_rate = sampleHeartRate();
    data.spo2 = sampleSpO2();
    data.temperature = sampleAnalogTemp();
    data.battery_percentage = readBatteryPercentage();
    data.wifi_status = is_wifi_connected ? "Connected" : "Disconnected";
    return data;
}
