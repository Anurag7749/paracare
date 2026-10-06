# ParaCare – Smart Wearable Eye-Blink Communication & Health Monitoring System

ParaCare is an IoT-based assistive communication and health monitoring system designed for paralyzed patients.

## System Architecture

- **Firmware (`firmware/`)**: ESP32 C++ PlatformIO code with Edge FSM for blink classification and health sensor sampling.
- **Backend (`backend/`)**: Python Flask REST API & Socket.IO server with PostgreSQL database.
- **Frontend (`frontend/`)**: React + Vite + Tailwind CSS dashboard with live charts (Recharts) and real-time Socket.IO alerts.
- **Simulator (`simulator/`)**: Standalone Python simulator for testing hardware telemetry & eye-blink command sequences without physical hardware.

## Structure Overview

```
d:/Major/
├── backend/        # Flask REST & WebSocket backend with SQLAlchemy
├── frontend/       # React + Vite + Tailwind CSS Caregiver Dashboard
├── firmware/       # ESP32 C++ Firmware (PlatformIO)
├── simulator/      # Python hardware telemetry & blink command simulator
└── docker-compose.yml # PostgreSQL database orchestration
```
