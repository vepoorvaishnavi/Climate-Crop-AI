from flask_sqlalchemy import SQLAlchemy  # type: ignore
from flask_login import UserMixin  # type: ignore
from datetime import datetime

db = SQLAlchemy()


class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    email = db.Column(db.String(120), nullable=False, unique=True)
    password = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    farm_profiles = db.relationship("FarmProfile", backref="owner", lazy=True)
    saved_plans = db.relationship("SavedPlan", backref="user", lazy=True)


class FarmProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    farm_name = db.Column(db.String(100), nullable=False)
    size_acres = db.Column(db.Float, nullable=False)
    state = db.Column(db.String(50), nullable=False)
    soil_type = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class SavedPlan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    crop_name = db.Column(db.String(50), nullable=False)
    score = db.Column(db.Float)
    risk = db.Column(db.String(20))
    season = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
