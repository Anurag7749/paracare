from app.routes.health_routes import health_bp
from app.routes.auth_routes import auth_bp
from app.routes.patient_routes import patient_bp
from app.routes.device_routes import device_bp
from app.routes.telemetry_routes import telemetry_bp
from app.routes.blink_routes import blink_bp
from app.routes.alert_routes import alert_bp
from app.routes.simulator_routes import simulator_bp
from app.routes.caregiver_routes import caregiver_bp
from app.routes.report_routes import report_bp

def register_blueprints(app):
    """Register all route blueprints with standard API prefixes."""
    # Health check (unversioned + versioned)
    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(health_bp, url_prefix='/api/v1', name='health_v1')
    # Auth
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(auth_bp, url_prefix='/api/v1/auth', name='auth_v1')
    # Patients
    app.register_blueprint(patient_bp, url_prefix='/api/v1/patients')
    # Caregivers
    app.register_blueprint(caregiver_bp, url_prefix='/api/v1/caregivers')
    # Devices (ESP32 primary + versioned)
    app.register_blueprint(device_bp, url_prefix='/api/device')
    app.register_blueprint(device_bp, url_prefix='/api/v1/devices', name='device_v1')
    # Telemetry
    app.register_blueprint(telemetry_bp, url_prefix='/api/v1/telemetry')
    # Blink events
    app.register_blueprint(blink_bp, url_prefix='/api/v1/blink-events')
    # Alerts
    app.register_blueprint(alert_bp, url_prefix='/api/alerts')
    app.register_blueprint(alert_bp, url_prefix='/api/v1/alerts', name='alert_v1')
    # Simulator
    app.register_blueprint(simulator_bp, url_prefix='/api/simulator')
    app.register_blueprint(simulator_bp, url_prefix='/api/v1/simulator', name='simulator_v1')
    # Reports
    app.register_blueprint(report_bp, url_prefix='/api/v1/reports')
