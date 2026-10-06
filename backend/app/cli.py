import click
from flask.cli import with_appcontext
from app.extensions import db
from app.seeds.seed_data import seed_database

@click.command('init-db')
@with_appcontext
def init_db_command():
    """Create all database tables."""
    db.create_all()
    click.echo('Initialized the PostgreSQL database tables.')

@click.command('seed-db')
@with_appcontext
def seed_db_command():
    """Seed initial development data into the database."""
    seed_database()
    click.echo('Seeded database successfully.')

def register_cli_commands(app):
    app.cli.add_command(init_db_command)
    app.cli.add_command(seed_db_command)
