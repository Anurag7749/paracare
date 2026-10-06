"""
Database setup & migration helper script.
"""
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.extensions import db
from app.seeds.seed_data import seed_database

def init_database():
    app = create_app('development')
    with app.app_context():
        print("Resetting and creating PostgreSQL tables...")
        db.drop_all()
        db.create_all()
        print("Seeding database...")
        seed_database()
        print("Database setup complete.")

if __name__ == '__main__':
    init_database()
