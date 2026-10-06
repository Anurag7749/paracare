#include <Arduino.h>
#include "config.h"
#include "BlinkFSM.h"
#include "HealthSensors.h"
#include "NetworkManager.h"

BlinkFSM blinkFSM;
HealthSensors sensors;
NetworkManager network;

unsigned long last_heartbeat_time = 0;

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=========================================");
    Serial.println("   ParaCare Smart Glasses ESP32 Firmware  ");
    Serial.println("=========================================\n");

    // Initialize subsystems
    blinkFSM.begin();
    sensors.begin();
    network.begin();

    Serial.println("[System] Setup complete. Entering main monitoring loop...");
}

void loop() {
    // 1. Maintain Wi-Fi connectivity in background
    network.maintainConnection();

    // 2. Sample IR sensor & run Blink Classification FSM
    BlinkResult blink = blinkFSM.update();

    // 3. If an actionable blink event is detected, transmit to Flask backend
    if (blink.has_event) {
        Serial.printf("[FSM] Blink Event Detected: %s (Count: %d, Duration: %.2fs)\n",
                      blink.command_str, blink.blink_count, blink.duration_seconds);

        VitalsData vitals = sensors.readVitals(network.isConnected());
        bool success = network.sendDeviceData(blink, vitals);

        if (!success) {
            Serial.println("[System] Failed to transmit device data. Retrying in background...");
        }
    }

    // 4. Send periodic device heartbeat keep-alive signal
    unsigned long now = millis();
    if (now - last_heartbeat_time >= HEARTBEAT_INTERVAL_MS) {
        last_heartbeat_time = now;
        Serial.println("[Heartbeat] Transmitting device status to backend...");
        VitalsData vitals = sensors.readVitals(network.isConnected());
        network.sendHeartbeat(vitals);
    }

    // Short non-blocking yield for ESP32 watchdog & task scheduling
    delay(10);
}
