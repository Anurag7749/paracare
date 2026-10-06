from flask import Blueprint, request
from app.services.device_service import process_device_data, process_device_heartbeat
from app.utils.response import success_response

device_bp = Blueprint('device', __name__)


@device_bp.route('/data', methods=['POST'])
def receive_device_data():
    """
    POST /api/device/data
    Receives combined health telemetry + blink event payload from ESP32.
    Requires an 'X-Device-Key' header matching the device's provisioned
    API key (see DEVICE_AUTH_REQUIRED config). All processing is delegated
    to the device_service pipeline.
    """
    data = request.get_json(silent=True) or {}
    api_key = request.headers.get('X-Device-Key')
    result = process_device_data(data, api_key=api_key)
    return success_response(
        data=result,
        message="Device data processed successfully",
        status_code=201
    )


@device_bp.route('/heartbeat', methods=['POST'])
def receive_device_heartbeat():
    """
    POST /api/device/heartbeat
    Lightweight keep-alive signal from ESP32 to update online status.
    Requires the same 'X-Device-Key' header as /api/device/data.
    """
    data = request.get_json(silent=True) or {}
    api_key = request.headers.get('X-Device-Key')
    result = process_device_heartbeat(data, api_key=api_key)
    return success_response(
        data=result,
        message="Heartbeat received",
        status_code=200
    )
