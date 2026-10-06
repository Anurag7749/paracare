import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'paracare-dev-secret-key-change-in-prod')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'paracare-dev-jwt-secret-key-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES_HOURS', 1)))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv('JWT_REFRESH_TOKEN_EXPIRES_DAYS', 30)))
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'postgresql://paracare_user:paracare_password@localhost:5432/paracare_db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    # When True (default / recommended), every ESP32/simulator request to
    # /api/device/* must include a valid 'X-Device-Key' header matching the
    # device's provisioned API key. Set to 'false' only for quick local
    # experimentation with devices that have no key configured yet -
    # never disable this in production.
    DEVICE_AUTH_REQUIRED = os.getenv('DEVICE_AUTH_REQUIRED', 'true').lower() == 'true'

class DevelopmentConfig(Config):
    DEBUG = True
    LOG_LEVEL = 'DEBUG'

class TestingConfig(Config):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv('TEST_DATABASE_URL', 'sqlite:///file:paracare_test?mode=memory&cache=shared&uri=true')
    DEVICE_AUTH_REQUIRED = os.getenv('DEVICE_AUTH_REQUIRED', 'false').lower() == 'true'



class ProductionConfig(Config):
    DEBUG = False
    LOG_LEVEL = 'WARNING'

config_by_name = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
