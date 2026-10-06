from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from app.services.simulator_service import process_simulator_blink
from app.utils.response import success_response

simulator_bp = Blueprint('simulator', __name__)


@simulator_bp.route('/blink', methods=['POST'])
@jwt_required()
def simulate_blink():
    """
    POST /api/simulator/blink
    
    Simulate an eye-blink command through the full device pipeline.
    All data is tagged with source=SIMULATOR.
    """
    data = request.get_json(silent=True) or {}
    result = process_simulator_blink(data)
    return success_response(
        data=result,
        message="Simulated blink processed successfully",
        status_code=201
    )
