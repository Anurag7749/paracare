# ParaCare ESP32 Hardware Simulator

This script simulates an ESP32 Smart Wearable device sending periodic health telemetry (Heart Rate, SpO2, Temperature, Battery, RSSI) and interactive eye-blink commands (Water, Food, Medicine, Emergency SOS) to the Flask backend.

## Interactive Controls (Phase 4):
- Press `2`: 2 Blinks (Need Water)
- Press `3`: 3 Blinks (Need Food)
- Press `4`: 4 Blinks (Need Medicine)
- Press `S`: Continuous Eye Closure >= 3s (Emergency SOS)
