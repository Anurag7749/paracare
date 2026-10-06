#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "BlinkFSM.h"
#include "HealthSensors.h"

class NetworkManager {
public:
    NetworkManager();
    void begin();
    bool isConnected();
    void maintainConnection();

    bool sendDeviceData(const BlinkResult& blink, const VitalsData& vitals);
    bool sendHeartbeat(const VitalsData& vitals);

private:
    String getISOTimestamp();
    bool postJSON(const char* url, const String& json_str);

    unsigned long last_reconnect_attempt;
};

#endif // NETWORK_MANAGER_H
