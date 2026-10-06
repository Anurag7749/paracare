"""
ParaCare Software Simulator Service

Processes simulated blink commands through the same pipeline as real ESP32 data.
All simulated events are tagged with source=SIMULATOR.
"""

from datetime import datetime, timezone
import random
from app.extensions import db
from app.models import Device, Patient, CommandEnum, SourceEnum
from app.services.device_service import process_device_data
from app.services.blink_service import classify_blink
from app.errors.exceptions import ValidationError, NotFoundError


def generate_simulated_vitals():
    """Generate realistic but clearly simulated health vital readings."""
    return {
        "heart_rate": round(random.uniform(65, 100), 1),
        "spo2": round(random.uniform(94, 99), 1),
        "temperature": round(random.uniform(36.2, 37.8), 1),
        "battery_percentage": round(random.uniform(60, 100), 1),
        "wifi_status": "Connected (Simulated)"
    }


def process_simulator_blink(data):
    """
    Process a simulated blink command through the full device pipeline.
    
    The simulator does NOT write directly to PostgreSQL.
    It builds a device-format payload and sends it through process_device_data().
    
    Flow: Simulator → Flask → validation → PostgreSQL → WebSocket → Alert Engine
    """
    blink_count = data.get('blink_count', 1)
    blink_duration = data.get('blink_duration', 0.0)
    command = data.get('command')
    device_id = data.get('device_id')
    patient_id = data.get('patient_id')
    
    if not command:
        classified = classify_blink(blink_count, blink_duration)
        command = classified['command']

    # If no device_id provided, use the first available device
    if not device_id:

        device = Device.query.filter(Device.is_online == True).first()
        if not device:
            device = Device.query.first()
        if not device:
            raise NotFoundError("No devices registered in the system")
        device_id = device.device_id

    # If no patient_id provided, get patient assigned to device
    if not patient_id:
        device = Device.query.filter_by(device_id=device_id).first()
        if device and device.patient_id:
            patient = Patient.query.get(device.patient_id)
            if patient:
                patient_id = patient.patient_code

    if not patient_id:
        raise ValidationError("patient_id is required (no patient assigned to device)")

    # Generate simulated vitals
    vitals = generate_simulated_vitals()

    # Build the full device payload (same format as ESP32)
    device_payload = {
        "device_id": device_id,
        "patient_id": patient_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "blink_count": int(blink_count),
        "blink_duration": float(blink_duration),
        "command": command,
        "source": SourceEnum.SIMULATOR.value,
        "heart_rate": vitals["heart_rate"],
        "spo2": vitals["spo2"],
        "temperature": vitals["temperature"],
        "battery_percentage": vitals["battery_percentage"],
        "wifi_status": vitals["wifi_status"]
    }

    # Process through the same pipeline as ESP32 data
    result = process_device_data(device_payload)
    result["source"] = SourceEnum.SIMULATOR.value
    result["simulated_vitals"] = vitals
    result["demo_mode"] = True

    return result
