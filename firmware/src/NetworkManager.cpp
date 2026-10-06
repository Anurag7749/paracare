#include "NetworkManager.h"
#include <time.h>

NetworkManager::NetworkManager() : last_reconnect_attempt(0) {}

void NetworkManager::begin() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("[WiFi] Connecting to ");
    Serial.println(WIFI_SSID);

    unsigned long start_time = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start_time < 10000) {
        delay(500);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
        // Configure NTP for accurate timestamps
        configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    } else {
        Serial.println("\n[WiFi] Connection timeout. Will retry in background loop.");
    }
}

bool NetworkManager::isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

void NetworkManager::maintainConnection() {
    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        if (now - last_reconnect_attempt > 10000) {
            last_reconnect_attempt = now;
            Serial.println("[WiFi] Reconnecting...");
            WiFi.disconnect();
            WiFi.reconnect();
        }
    }
}

String NetworkManager::getISOTimestamp() {
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 100)) {
        char buf[30];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        return String(buf);
    }
    // Fallback if NTP unavailable
    return String("2026-08-10T19:40:00Z");
}

bool NetworkManager::postJSON(const char* url, const String& json_str) {
    if (!isConnected()) {
        Serial.println("[HTTP] Error: Wi-Fi disconnected. Cannot send POST.");
        return false;
    }

    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    // Device authentication: the backend requires this header to match the
    // provisioned device credential (see config.h DEVICE_API_KEY). Requests
    // without it, or with an incorrect key, are rejected with HTTP 401 -
    // the device_id field alone is never treated as authentication.
    http.addHeader("X-Device-Key", DEVICE_API_KEY);

    int httpResponseCode = http.POST(json_str);

    if (httpResponseCode > 0) {
        Serial.printf("[HTTP] POST to %url | Response code: %d\n", url, httpResponseCode);
        String response = http.getString();
        Serial.println("[HTTP] Response: " + response);
        http.end();
        return (httpResponseCode >= 200 && httpResponseCode < 300);
    } else {
        Serial.printf("[HTTP] POST failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
        http.end();
        return false;
    }
}

bool NetworkManager::sendDeviceData(const BlinkResult& blink, const VitalsData& vitals) {
    StaticJsonDocument<512> doc;

    doc["device_id"] = DEVICE_ID;
    doc["patient_id"] = PATIENT_CODE;
    doc["timestamp"] = getISOTimestamp();
    doc["blink_count"] = blink.blink_count;
    doc["blink_duration"] = blink.duration_seconds;
    doc["command"] = blink.command_str;
    doc["source"] = "ESP32";
    doc["heart_rate"] = vitals.heart_rate;
    doc["spo2"] = vitals.spo2;
    doc["temperature"] = vitals.temperature;
    doc["battery_percentage"] = vitals.battery_percentage;
    doc["wifi_status"] = vitals.wifi_status;

    String payload;
    serializeJson(doc, payload);

    return postJSON(DEVICE_DATA_ENDPOINT, payload);
}

bool NetworkManager::sendHeartbeat(const VitalsData& vitals) {
    StaticJsonDocument<256> doc;

    doc["device_id"] = DEVICE_ID;
    doc["patient_id"] = PATIENT_CODE;
    doc["timestamp"] = getISOTimestamp();
    doc["battery_percentage"] = vitals.battery_percentage;
    doc["wifi_status"] = vitals.wifi_status;

    String payload;
    serializeJson(doc, payload);

    return postJSON(HEARTBEAT_ENDPOINT, payload);
}
