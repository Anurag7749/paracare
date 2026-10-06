from flask import Flask
from app.config import config_by_name
from app.extensions import db, migrate, jwt, socketio, cors
from app.utils.logger import setup_logger
from app.errors.handlers import register_error_handlers
from app.routes import register_blueprints
from app.websocket.events import register_socket_events
from app.cli import register_cli_commands

def create_app(config_name='development'):
    """Application factory for ParaCare Flask Backend."""
    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name['default']))

    # Setup Logging
    setup_logger(app)

    # Initialize Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, origins=app.config.get('CORS_ORIGINS'))
    socketio.init_app(app)

    # Register Error Handlers
    register_error_handlers(app)

    # Import Models for SQLAlchemy registration without shadowing the Flask app variable
    import app.models as models

    # Register Route Blueprints
    register_blueprints(app)

    # Register WebSocket Event Handlers
    register_socket_events(socketio)

    # Register CLI Commands
    register_cli_commands(app)

    return app
