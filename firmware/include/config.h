#ifndef PARACARE_CONFIG_H
#define PARACARE_CONFIG_H

#include <Arduino.h>

// ============================================================================
// Wi-Fi & Backend Server Configuration
// ============================================================================
#define WIFI_SSID             "YOUR_WIFI_SSID"
#define WIFI_PASSWORD         "YOUR_WIFI_PASSWORD"
#define BACKEND_BASE_URL      "http://192.168.1.100:5000" // Update to Flask IP
#define DEVICE_DATA_ENDPOINT  BACKEND_BASE_URL "/api/device/data"
#define HEARTBEAT_ENDPOINT    BACKEND_BASE_URL "/api/device/heartbeat"

// Device & Patient Identity
#define DEVICE_ID             "PARACARE-001"
#define PATIENT_CODE          "PATIENT-001"

// Device API Key (secret credential, NOT the device_id).
// This must match the hashed key provisioned for this device_id in the
// PostgreSQL 'devices' table (see backend/app/seeds/seed_data.py, printed
// once at seed time). The backend rejects requests with a missing/incorrect
// key with HTTP 401 - device_id alone is never sufficient for authentication.
// CONFIGURATION PLACEHOLDER: replace with the real provisioned key before
// flashing to a production device. Do not commit real keys to source control.
#define DEVICE_API_KEY        "REPLACE_WITH_PROVISIONED_DEVICE_API_KEY"

// ============================================================================
// Hardware Pin Placeholders (ESP32 GPIO Assignment)
// ============================================================================
#define PIN_IR_BLINK_SENSOR   34  // Analog/Digital IR Obstacle/Eye-blink sensor
#define PIN_HAPTIC_MOTOR      23  // Haptic feedback vibration motor output
#define PIN_BATTERY_ADC       35  // Battery voltage divider analog input

// Sensor Placeholders (I2C / Analog)
#define PIN_SDA               21  // MAX30102 (HR/SpO2) SDA
#define PIN_SCL               22  // MAX30102 (HR/SpO2) SCL
#define PIN_TEMP_SENSOR       4   // DS18B20 / LM35 Temperature sensor

// ============================================================================
// Blink Classification FSM Parameters
// ============================================================================
#define IR_THRESHOLD_CLOSED   1500   // ADC threshold for eye closed (low/high depending on sensor)
#define DEBOUNCE_MS           50     // Debounce filter window
#define OBS_WINDOW_MS         7000   // 7-second observation window for multi-blinks
#define EMERGENCY_HOLD_MS     3000   // Continuous eye closure >= 3.0s = EMERGENCY


// Timers & Intervals
#define HEARTBEAT_INTERVAL_MS 30000  // Send heartbeat every 30 seconds
#define RETRY_DELAY_MS        2000   // Delay before HTTP retry

#endif // PARACARE_CONFIG_H
