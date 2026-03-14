from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
import random
from typing import Dict, List, Any
import sys
import os
import requests  # type: ignore
from collections import Counter
from flask_login import (  # type: ignore
    LoginManager,
    login_user,
    current_user,
    logout_user,
    login_required,
)
from flask_bcrypt import Bcrypt  # type: ignore
from models import db, User, FarmProfile, SavedPlan  # type: ignore
import json
from datetime import datetime

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "default_dev_secret_key")

# Database Configuration (supports Render's PostgreSQL)
uri = os.environ.get("DATABASE_URL", "sqlite:///site.db")
if uri.startswith("postgres://"):
    uri = uri.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = uri
app.config["TEMPLATES_AUTO_RELOAD"] = True

# Initialize extensions
db.init_app(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message_category = "info"


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


with app.app_context():
    db.create_all()


# ─── Farmer Feedback Store ────────────────────────────────────────────────────
feedback_list = []

# Seed with some realistic testimonials
feedback_list.extend(
    [
        {
            "name": "Ramesh Kumar",
            "state": "Punjab",
            "crop": "Wheat",
            "problem_type": "other",
            "message": "The crop recommendation helped me choose wheat this season. The weather alerts were spot on and saved my field from unexpected frost.",
            "rating": "5",
            "photo": None,
        },
        {
            "name": "Suresh Reddy",
            "state": "Andhra Pradesh",
            "crop": "Rice",
            "problem_type": "other",
            "message": "The weather alerts helped protect my crop from the cyclone. Excellent tool for every farmer!",
            "rating": "5",
            "photo": None,
        },
        {
            "name": "Priya Devi",
            "state": "Tamil Nadu",
            "crop": "Sugarcane",
            "problem_type": "crop_recommendation",
            "message": "I tried the sugarcane recommendation and got a great yield this year. Very accurate tool.",
            "rating": "4",
            "photo": None,
        },
        {
            "name": "Mahesh Yadav",
            "state": "Uttar Pradesh",
            "crop": "Mustard",
            "problem_type": "other",
            "message": "Helped me plan the right crop rotation. The economics section is very helpful for budgeting.",
            "rating": "4",
            "photo": None,
        },
        {
            "name": "Anita Patel",
            "state": "Madhya Pradesh",
            "crop": "Soybean",
            "problem_type": "weather_prediction",
            "message": "Weather prediction needs improvement for my region but crop advice is excellent.",
            "rating": "3",
            "photo": None,
        },
    ]
)

# ─── Crop Knowledge Base ───────────────────────────────────────────────────────
CROP_DATABASE: Dict[str, Dict[str, Any]] = {
    "Rice": {
        "icon": "🌾",
        "color": "#4CAF50",
        "optimal_rainfall": (1200, 2000),
        "optimal_temp": (22, 35),
        "soils": ["Clay", "Loamy", "Silty"],
        "seasons": ["Kharif", "Rabi"],
        "water_need": "High",
        "growth_days": 120,
        "description": "Staple grain crop highly adaptable to flooded conditions.",
        "market_value": "₹18-22/kg",
        "protein": "7.1g/100g",
        "irrigation": "Water every 3–4 days; 1200–1500 mm total.",
        "economics": {
            "yield_per_acre": "2.5 tons",
            "price": "₹22/kg",
            "profit": "₹55,000/acre",
        },
        "calendar": [
            "Sowing (Jun)",
            "Vegetative (Jul-Aug)",
            "Fertilization (Sep)",
            "Harvest (Oct)",
        ],
        "rotation": "Chickpea or Mustard",
    },
    "Wheat": {
        "icon": "🌿",
        "color": "#FFC107",
        "optimal_rainfall": (400, 900),
        "optimal_temp": (10, 25),
        "soils": ["Loamy", "Clay", "Sandy Loam"],
        "seasons": ["Rabi", "Winter"],
        "water_need": "Medium",
        "growth_days": 110,
        "description": "Cool-season cereal crop with high yield potential.",
        "market_value": "₹20-25/kg",
        "protein": "12.6g/100g",
        "irrigation": "Water every 7–10 days; 450–650 mm total.",
        "economics": {
            "yield_per_acre": "2.0 tons",
            "price": "₹25/kg",
            "profit": "₹50,000/acre",
        },
        "calendar": [
            "Sowing (Nov)",
            "Tillering (Dec-Jan)",
            "Flowering (Feb)",
            "Harvest (Mar-Apr)",
        ],
        "rotation": "Maize or Soybean",
    },
    "Maize": {
        "icon": "🌽",
        "color": "#FF9800",
        "optimal_rainfall": (600, 1100),
        "optimal_temp": (18, 32),
        "soils": ["Sandy Loam", "Loamy", "Clay"],
        "seasons": ["Kharif", "Summer"],
        "water_need": "Medium",
        "growth_days": 90,
        "description": "Versatile crop suitable for food, feed, and biofuel.",
        "market_value": "₹15-18/kg",
        "protein": "9.4g/100g",
        "irrigation": "Water every 5–7 days; 500–800 mm total.",
        "economics": {
            "yield_per_acre": "3.0 tons",
            "price": "₹18/kg",
            "profit": "₹54,000/acre",
        },
        "calendar": [
            "Sowing (Jun/Mar)",
            "Growth (Jul/Apr)",
            "Tasseling (Aug/May)",
            "Harvest (Sep/Jun)",
        ],
        "rotation": "Mustard or Wheat",
    },
    "Cotton": {
        "icon": "☁️",
        "color": "#9C27B0",
        "optimal_rainfall": (600, 1200),
        "optimal_temp": (20, 35),
        "soils": ["Black Cotton", "Sandy Loam", "Loamy"],
        "seasons": ["Kharif"],
        "water_need": "Medium-High",
        "growth_days": 160,
        "description": "Cash crop ideal for black soil regions with warm climate.",
        "market_value": "₹55-65/kg",
        "protein": "N/A",
        "irrigation": "Water every 10–12 days; 700–1200 mm total.",
        "economics": {
            "yield_per_acre": "0.8 tons",
            "price": "₹65/kg",
            "profit": "₹52,000/acre",
        },
        "calendar": [
            "Sowing (May-Jun)",
            "Squaring (Aug)",
            "Bols (Sep-Oct)",
            "Picking (Nov-Dec)",
        ],
        "rotation": "Groundnut or Gram",
    },
    "Soybean": {
        "icon": "🫘",
        "color": "#8BC34A",
        "optimal_rainfall": (500, 900),
        "optimal_temp": (20, 30),
        "soils": ["Loamy", "Sandy Loam", "Clay"],
        "seasons": ["Kharif"],
        "water_need": "Medium",
        "growth_days": 100,
        "description": "Nitrogen-fixing legume with high protein content.",
        "market_value": "₹38-45/kg",
        "protein": "36.5g/100g",
        "irrigation": "Water every 7–10 days; 450–700 mm total.",
        "economics": {
            "yield_per_acre": "1.2 tons",
            "price": "₹45/kg",
            "profit": "₹54,000/acre",
        },
        "calendar": [
            "Sowing (Jun)",
            "Seedling (Jul)",
            "Flowering (Aug)",
            "Harvest (Sep-Oct)",
        ],
        "rotation": "Wheat or Mustard",
    },
    "Sugarcane": {
        "icon": "🎋",
        "color": "#00BCD4",
        "optimal_rainfall": (1000, 2000),
        "optimal_temp": (25, 35),
        "soils": ["Loamy", "Clay", "Alluvial"],
        "seasons": ["Kharif", "Rabi", "Summer", "Winter"],
        "water_need": "Very High",
        "growth_days": 365,
        "description": "High-value cash crop for sugar and ethanol production.",
        "market_value": "₹3.1-3.5/kg",
        "protein": "N/A",
        "irrigation": "Water every 10–15 days; 1500–2500 mm total.",
        "economics": {
            "yield_per_acre": "35 tons",
            "price": "₹3.5/kg",
            "profit": "₹1,22,500/acre",
        },
        "calendar": [
            "Planting (Jan-Mar)",
            "Tillering (Apr-Jun)",
            "Growth (Jul-Oct)",
            "Harvest (Dec-Mar)",
        ],
        "rotation": "Pulses or Green Manure",
    },
    "Groundnut": {
        "icon": "🥜",
        "color": "#795548",
        "optimal_rainfall": (400, 800),
        "optimal_temp": (22, 33),
        "soils": ["Sandy Loam", "Sandy", "Loamy"],
        "seasons": ["Kharif", "Rabi"],
        "water_need": "Low-Medium",
        "growth_days": 120,
        "description": "Drought-tolerant oilseed crop with sandy soil preference.",
        "market_value": "₹45-55/kg",
        "protein": "25.8g/100g",
        "irrigation": "Water every 12–15 days; 400–600 mm total.",
        "economics": {
            "yield_per_acre": "1.0 tons",
            "price": "₹55/kg",
            "profit": "₹55,000/acre",
        },
        "calendar": [
            "Sowing (Jun/Oct)",
            "Pegging (Jul/Nov)",
            "Pod formation (Aug/Dec)",
            "Harvest (Oct/Feb)",
        ],
        "rotation": "Cotton or Sunflower",
    },
    "Tomato": {
        "icon": "🍅",
        "color": "#F44336",
        "optimal_rainfall": (400, 800),
        "optimal_temp": (18, 28),
        "soils": ["Sandy Loam", "Loamy", "Silty"],
        "seasons": ["Rabi", "Summer"],
        "water_need": "Medium",
        "growth_days": 75,
        "description": "High-value vegetable crop with good market demand.",
        "market_value": "₹15-40/kg",
        "protein": "0.9g/100g",
        "irrigation": "Water every 3–5 days; 400–600 mm total.",
        "economics": {
            "yield_per_acre": "8.0 tons",
            "price": "₹20/kg",
            "profit": "₹1,60,000/acre",
        },
        "calendar": [
            "Nursery (Nov-Dec)",
            "Transplant (Jan)",
            "Growth (Feb)",
            "Harvest (Mar-Apr)",
        ],
        "rotation": "Beans or Cabbage",
    },
    "Chickpea": {
        "icon": "🌱",
        "color": "#607D8B",
        "optimal_rainfall": (300, 700),
        "optimal_temp": (15, 28),
        "soils": ["Sandy Loam", "Loamy", "Clay"],
        "seasons": ["Rabi", "Winter"],
        "water_need": "Low",
        "growth_days": 95,
        "description": "Drought-resistant pulse crop with high protein value.",
        "market_value": "₹55-70/kg",
        "protein": "19g/100g",
        "irrigation": "Water only if needed; 200–300 mm total.",
        "economics": {
            "yield_per_acre": "0.7 tons",
            "price": "₹70/kg",
            "profit": "₹49,000/acre",
        },
        "calendar": [
            "Sowing (Oct-Nov)",
            "Flowering (Jan)",
            "Podding (Feb)",
            "Harvest (Mar)",
        ],
        "rotation": "Rice or Sorghum",
    },
    "Mustard": {
        "icon": "🌼",
        "color": "#FFEB3B",
        "optimal_rainfall": (250, 600),
        "optimal_temp": (10, 22),
        "soils": ["Loamy", "Sandy Loam", "Clay"],
        "seasons": ["Rabi", "Winter"],
        "water_need": "Low",
        "growth_days": 110,
        "description": "Cool-season oilseed crop with excellent drought tolerance.",
        "market_value": "₹48-58/kg",
        "protein": "25g/100g",
        "irrigation": "Water every 15–20 days; 250–400 mm total.",
        "economics": {
            "yield_per_acre": "0.6 tons",
            "price": "₹58/kg",
            "profit": "₹34,800/acre",
        },
        "calendar": [
            "Sowing (Oct)",
            "Vegetative (Nov-Dec)",
            "Flowering (Jan)",
            "Harvest (Feb-Mar)",
        ],
        "rotation": "Maize or Pearl Millet",
    },
    "Potato": {
        "icon": "🥔",
        "color": "#D7B56D",
        "optimal_rainfall": (500, 800),
        "optimal_temp": (15, 25),
        "soils": ["Sandy Loam", "Loamy"],
        "seasons": ["Rabi"],
        "water_need": "Medium",
        "growth_days": 90,
        "description": "Major tuber crop grown widely in Uttar Pradesh and Punjab.",
        "market_value": "₹12-20/kg",
        "protein": "2g/100g",
        "irrigation": "Regular watering every 7–10 days.",
        "economics": {
            "yield_per_acre": "10.0 tons",
            "price": "₹15/kg",
            "profit": "₹1,00,000/acre",
        },
        "calendar": ["Sowing (Oct)", "Growth (Nov-Jan)", "Harvest (Feb)"],
        "rotation": "Maize or Pulses",
    },
    "Turmeric": {
        "icon": "🫚",
        "color": "#FFC107",
        "optimal_rainfall": (1500, 2500),
        "optimal_temp": (20, 30),
        "soils": ["Loamy", "Silty Loam", "Clay Loam"],
        "seasons": ["Kharif"],
        "water_need": "High",
        "growth_days": 240,
        "description": "Important spice crop, highly popular in Telangana.",
        "market_value": "₹80-120/kg",
        "protein": "7.8g/100g",
        "irrigation": "Frequent irrigation; 1500–2500 mm total.",
        "economics": {
            "yield_per_acre": "2.0 tons",
            "price": "₹100/kg",
            "profit": "₹1,50,000/acre",
        },
        "calendar": ["Planting (Jun)", "Growth (Aug-Dec)", "Harvest (Feb)"],
        "rotation": "Maize or Vegetables",
    },
    "Chillies": {
        "icon": "🌶️",
        "color": "#F44336",
        "optimal_rainfall": (600, 1200),
        "optimal_temp": (20, 30),
        "soils": ["Loamy", "Clay Loam"],
        "seasons": ["Kharif", "Rabi"],
        "water_need": "Medium",
        "growth_days": 150,
        "description": "High-value spice crop with strong demand in Andhra Pradesh.",
        "market_value": "₹150-250/kg",
        "protein": "2g/100g",
        "irrigation": "Water every 5–7 days; 600–1000 mm total.",
        "economics": {
            "yield_per_acre": "1.5 tons",
            "price": "₹200/kg",
            "profit": "₹2,00,000/acre",
        },
        "calendar": ["Sowing (Jun/Oct)", "Growth (Aug/Dec)", "Harvest (Oct/Feb)"],
        "rotation": "Legumes",
    },
    "Pulses": {
        "icon": "🫛",
        "color": "#4CAF50",
        "optimal_rainfall": (400, 700),
        "optimal_temp": (20, 30),
        "soils": ["Loamy", "Sandy Loam"],
        "seasons": ["Rabi", "Kharif"],
        "water_need": "Low",
        "growth_days": 120,
        "description": "Essential protein sources like Moong, Urad, and Pigeon Pea.",
        "market_value": "₹60-90/kg",
        "protein": "22g/100g",
        "irrigation": "Minimal watering needed.",
        "economics": {
            "yield_per_acre": "0.6 tons",
            "price": "₹80/kg",
            "profit": "₹40,000/acre",
        },
        "calendar": ["Sowing (Jun/Oct)", "Harvest (Oct/Feb)"],
        "rotation": "Cereals",
    },
}

WEATHER_HISTORY: Dict[str, Dict[str, List[float]]] = {
    "Andhra Pradesh": {
        "avg_rainfall": [12, 8, 12, 28, 65, 55, 115, 155, 155, 155, 85, 22],
        "avg_temp": [26, 28, 32, 35, 36, 33, 30, 30, 30, 28, 26, 25],
    },
    "Telangana": {
        "avg_rainfall": [10, 8, 10, 25, 55, 95, 175, 165, 145, 105, 45, 12],
        "avg_temp": [25, 28, 32, 36, 38, 34, 29, 28, 29, 27, 25, 24],
    },
    "Tamil Nadu": {
        "avg_rainfall": [35, 22, 15, 28, 52, 45, 85, 125, 145, 295, 345, 155],
        "avg_temp": [28, 30, 33, 35, 36, 34, 32, 32, 31, 29, 27, 27],
    },
    "Uttar Pradesh": {
        "avg_rainfall": [22, 18, 12, 8, 22, 95, 255, 265, 185, 38, 8, 12],
        "avg_temp": [14, 18, 25, 32, 37, 38, 34, 33, 30, 25, 18, 13],
    },
    "Madhya Pradesh": {
        "avg_rainfall": [18, 12, 8, 8, 22, 135, 325, 285, 185, 42, 12, 8],
        "avg_temp": [18, 22, 28, 34, 38, 36, 30, 28, 29, 27, 21, 17],
    },
    "Punjab": {
        "avg_rainfall": [45, 38, 52, 78, 92, 110, 185, 195, 125, 45, 12, 8],
        "avg_temp": [13, 16, 22, 30, 35, 38, 35, 33, 30, 25, 17, 13],
    },
}

STATE_COORDS = {
    "Andhra Pradesh": (15.9129, 79.7400),
    "Telangana": (18.1124, 79.0193),
    "Tamil Nadu": (11.1271, 78.6569),
    "Uttar Pradesh": (26.8467, 80.9462),
    "Madhya Pradesh": (22.9734, 78.6569),
    "Punjab": (31.1471, 75.3412),
}

DEFAULT_WEATHER: Dict[str, List[float]] = {
    "avg_rainfall": [25, 20, 15, 10, 30, 120, 220, 200, 150, 55, 20, 10],
    "avg_temp": [20, 22, 27, 32, 36, 35, 30, 29, 28, 25, 20, 18],
}

# Load state crop popularity data
try:
    with open("crop_data.json", "r") as f:
        STATE_CROP_DATA = json.load(f)
except FileNotFoundError:
    STATE_CROP_DATA = {}


def detect_season() -> str:
    month = datetime.now().month
    # Kharif: June to October
    # Rabi: November to March
    # Summer/Zaid: April to May (simplified)
    if 6 <= month <= 10:
        return "Kharif"
    elif month >= 11 or month <= 3:
        return "Rabi"
    else:
        return "Summer"


def calculate_crop_score(
    crop_name: str, crop_data: Dict[str, Any], user_data: Dict[str, Any]
) -> Dict[str, Any]:
    # Scale monthly rainfall to annual for comparison with database ranges
    rainfall = float(user_data["rainfall"]) * 12
    temp = float(user_data["temperature"])
    soil = user_data["soil_type"]
    season = user_data["season"]
    location = user_data.get("location", "Punjab")

    r_min, r_max = crop_data["optimal_rainfall"]
    t_min, t_max = crop_data["optimal_temp"]

    # 1. State Crop Popularity (40%)
    state_info = STATE_CROP_DATA.get(location, {})
    dominant_crops = state_info.get("dominant_crops", [])
    
    # Strictly filter based on dominant crops if the list exists for the state
    if dominant_crops and crop_name not in dominant_crops:
        return None # Indicate this crop should be filtered out

    popularity_map = state_info.get("popularity", {})
    pop_score_raw = popularity_map.get(crop_name, 0.1)  # Base 0.1 if not listed
    pop_score = pop_score_raw * 40.0

    # 2. Climate Suitability (30%) - Split between Rainfall (15%) and Temp (15%)
    r_center = (r_min + r_max) / 2.0
    r_range = (r_max - r_min) / 2.0
    if r_range == 0:
        r_range = 1.0
    # Higher penalty for climate mismatch
    r_match_raw = max(0.0, (1.0 - abs(rainfall - r_center) / (r_range * 1.5)))
    r_score = r_match_raw * 15.0

    t_center = (t_min + t_max) / 2.0
    t_range = (t_max - t_min) / 2.0
    if t_range == 0:
        t_range = 1.0
    t_match_raw = max(0.0, (1.0 - abs(temp - t_center) / (t_range * 1.5)))
    t_score = t_match_raw * 15.0
    climate_score = r_score + t_score

    # 3. Soil Compatibility (20%)
    soil_match_raw = 1.0 if soil in crop_data["soils"] else 0.2
    s_score = soil_match_raw * 20.0

    # 4. Market Value (10%)
    # Mock market value influence based on growth_days and profit data if available
    market_score_raw = 0.8  # Default
    if "economics" in crop_data:
        try:
            profit_str = crop_data["economics"].get("profit", "₹0").replace("₹", "").replace(",", "").split("/")[0]
            profit_val = float(profit_str)
            market_score_raw = min(1.0, profit_val / 150000.0) # Normalize against 1.5L profit
        except Exception:
            pass
    m_score = market_score_raw * 10.0

    # Seasonality Filter (Internal adjust but not part of the 4 weighted categories)
    # Suggestions: reduce core if season mismatch
    season_multiplier = 1.0 if season in crop_data["seasons"] else 0.5
    
    total = (pop_score + climate_score + s_score + m_score) * season_multiplier

    # Dominant crop boost: for any state, the top-2 popularity crops
    # get a boost when their season matches, to ensure they always appear
    # at the top regardless of climate variations (since farmers use irrigation)
    if dominant_crops and season in crop_data["seasons"]:
        sorted_pops = sorted(popularity_map.items(), key=lambda x: x[1], reverse=True)
        top_crop_names = [name for name, _ in sorted_pops[:2]]
        if crop_name in top_crop_names:
            total += 15.0  # Strong boost for the state's #1 and #2 crops

    # Risk calculation
    deviation = abs(rainfall - r_center) / max(r_center, 1.0) + abs(
        temp - t_center
    ) / max(t_center, 1.0)
    if deviation < 0.25:
        risk = "Low"
    elif deviation < 0.55:
        risk = "Medium"
    else:
        risk = "High"

    # Yield stability (0-100)
    yield_stability = min(100, int((r_match_raw * 0.4 + t_match_raw * 0.4 + soil_match_raw * 0.2) * 100))

    return {
        "score": round(float(total), 2),
        "risk": risk,
        "yield_stability": yield_stability,
        "rainfall_match": round(float(r_match_raw) * 100.0),
        "temp_match": round(float(t_match_raw) * 100.0),
        "soil_match": round(float(soil_match_raw) * 100.0),
        "season_match": round(100.0 if season in crop_data["seasons"] else 20.0),
        "market_score": round(float(m_score) * 10.0), # For UI if needed
        "popularity_score": round(float(pop_score) * 2.5), # Scale to 100 for match bars
    }


def get_climate_risk_score(rainfall: float, temp: float, location: str) -> int:
    hist = WEATHER_HISTORY.get(location, DEFAULT_WEATHER)
    avg_annual = sum(hist["avg_rainfall"])
    avg_temp_annual = sum(hist["avg_temp"]) / 12.0

    rainfall_deviation = abs(rainfall - avg_annual / 12.0) / max(avg_annual / 12.0, 1.0)
    temp_deviation = abs(temp - avg_temp_annual) / max(avg_temp_annual, 1.0)

    risk_score = min(
        100, int((rainfall_deviation * 40.0 + temp_deviation * 30.0) * 2.5 + 20.0)
    )
    return risk_score


@app.route("/")
def home():
    return render_template("home.html")


@app.route("/planner")
def planner():
    return render_template("planner.html")


@app.route("/results")
def results():
    return render_template("results.html")


@app.route("/insights")
def insights():
    return render_template("insights.html")


@app.route("/doctor")
def doctor():
    return render_template("doctor.html")


@app.route("/api/doctor/analyze", methods=["POST"])
def doctor_analyze():
    data = request.json or {}
    analyze_type = data.get("type")

    if analyze_type == "image":
        mock_diseases = [
            {
                "name": "Early Blight (Alternaria solani)",
                "confidence": 92,
                "treatments": [
                    "Apply copper-based fungicide immediately.",
                    "Remove and destroy affected leaves.",
                    "Improve spacing for better air circulation.",
                ],
                "prevention": "Rotate crops every 2 years and avoid overhead watering to keep foliage dry.",
            },
            {
                "name": "Leaf Curl Virus",
                "confidence": 88,
                "treatments": [
                    "Remove and burn infected plants immediately.",
                    "Control whitefly population via sticky traps.",
                    "Use neem oil as a deterrent.",
                ],
                "prevention": "Use virus-resistant seed varieties.",
            },
            {
                "name": "Powdery Mildew",
                "confidence": 95,
                "treatments": [
                    "Apply sulfur or potassium bicarbonate spray.",
                    "Prune heavily infected parts.",
                    "Water at the base of the plant only.",
                ],
                "prevention": "Ensure adequate sunlight and space between plants.",
            },
            {
                "name": "Healthy Plant",
                "confidence": 99,
                "treatments": [
                    "Keep up the good work!",
                    "Maintain current watering schedule.",
                    "Ensure balanced fertilization.",
                ],
                "prevention": "Continue regular monitoring for pests or discoloration.",
            },
        ]
        result = random.choice(mock_diseases)
        return jsonify(result)

    elif analyze_type == "text":
        text = data.get("text", "").lower()
        response = "I can help with crop diseases, soil health, and fertilizers. Could you provide more details?"
        if "yellow" in text or "spot" in text:
            response = "This sounds like **Early Blight (Alternaria solani)**. Common symptoms are dark spots with concentric rings. Treat with copper-based fungicide and remove lower leaves."
        elif "tomato" in text:
            response = "Tomato plants thrive in warm, well-drained soil. They are prone to late blight in high-humidity seasons."
        elif "soil" in text:
            response = "Most crops prefer a pH of 6.0 to 7.0 (slightly acidic). Have you done a soil test recently?"
        elif "fertilizer" in text or "npk" in text:
            response = "Nitrogen (N) is key for leafy growth, Phosphorus (P) for roots, and Potassium (K) for fruit quality. Use a balanced fertilizer for general gardening."
        return jsonify({"response": response})

    return jsonify({"error": "Invalid request type"})


@app.route("/calculator", methods=["GET", "POST"])
def calculator():
    if request.method == "POST":
        crop = request.form.get("crop", "Rice")
        acres = float(request.form.get("acres", 1.0))

        # Simple mockup NPK logic
        npk_base = {
            "Rice": {"N": 40, "P": 20, "K": 20, "Cost": 1500},
            "Wheat": {"N": 50, "P": 25, "K": 25, "Cost": 1800},
            "Maize": {"N": 45, "P": 20, "K": 20, "Cost": 1600},
            "Cotton": {"N": 60, "P": 30, "K": 30, "Cost": 2200},
            "Sugarcane": {"N": 100, "P": 40, "K": 40, "Cost": 3500},
            "Tomato": {"N": 30, "P": 15, "K": 15, "Cost": 1200},
        }

        req = npk_base.get(crop, {"N": 40, "P": 20, "K": 20, "Cost": 1500})
        result = {
            "N": float(f'{float(req["N"]) * acres:.2f}'),
            "P": float(f'{float(req["P"]) * acres:.2f}'),
            "K": float(f'{float(req["K"]) * acres:.2f}'),
            "Cost": float(f'{float(req["Cost"]) * acres:.2f}'),
        }
        return render_template("calculator.html", result=result, crop=crop, acres=acres)

    return render_template("calculator.html")


@app.route("/feedback", methods=["GET", "POST"])
def feedback():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        state = request.form.get("state", "")
        crop = request.form.get("crop", "").strip()
        problem_type = request.form.get("problem_type", "other")
        message = request.form.get("message", "").strip()
        rating = request.form.get("rating", "5")
        photo_filename = None

        # Handle photo upload
        if "photo" in request.files:
            photo = request.files["photo"]
            if photo and photo.filename:
                upload_dir = os.path.join(app.static_folder, "uploads")
                os.makedirs(upload_dir, exist_ok=True)
                safe_name = photo.filename.replace(" ", "_")
                photo.save(os.path.join(upload_dir, safe_name))
                photo_filename = safe_name

        if name and message:
            feedback_list.append(
                {
                    "name": name,
                    "state": state,
                    "crop": crop,
                    "problem_type": problem_type,
                    "message": message,
                    "rating": rating,
                    "photo": photo_filename,
                }
            )

        return redirect(url_for("feedback"))

    return render_template("feedback.html", feedbacks=feedback_list)


@app.route("/api/feedback/trends")
def feedback_trends():
    """Return AI-analyzed trend summary from feedback data."""
    if not feedback_list:
        return jsonify({"trends": [], "total": 0})

    state_crop_issues = {}
    for fb in feedback_list:
        key = (fb.get("state", "Unknown"), fb.get("crop", "Unknown"))
        state_crop_issues[key] = state_crop_issues.get(key, 0) + 1

    problem_counts = Counter(fb.get("problem_type", "other") for fb in feedback_list)
    avg_rating = sum(int(fb.get("rating", 3)) for fb in feedback_list) / max(
        len(feedback_list), 1
    )

    trends = []
    for (state, crop), count in sorted(state_crop_issues.items(), key=lambda x: -x[1]):
        if count >= 1:
            trends.append(f"{count} farmer(s) from {state} reporting issue with {crop}")

    top_problem = problem_counts.most_common(1)
    if top_problem:
        label_map = {
            "website_bug": "website bugs",
            "crop_recommendation": "crop recommendation issues",
            "weather_prediction": "weather prediction issues",
            "other": "general suggestions",
        }
        trends.insert(
            0,
            f"Top concern: {label_map.get(top_problem[0][0], top_problem[0][0])} ({top_problem[0][1]} reports)",
        )

    return jsonify(
        {
            "trends": [trends[i] for i in range(min(5, len(trends)))],
            "total": len(feedback_list),
            "avg_rating": float(f"{avg_rating:.1f}"),
        }
    )


# ─── USER AUTHENTICATION & DASHBOARD ─────────────────────────────────────────


@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")

        if (
            User.query.filter_by(username=username).first()
            or User.query.filter_by(email=email).first()
        ):
            flash(
                "Account already exists with that username or email. Please log in.",
                "danger",
            )
            return redirect(url_for("login"))

        hashed_password = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(username=username, email=email, password=hashed_password)
        db.session.add(user)
        db.session.commit()
        flash("Account created! You are now able to log in", "success")
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard"))
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        user = User.query.filter_by(email=email).first()
        if user and bcrypt.check_password_hash(user.password, password):
            login_user(user, remember=True)
            next_page = request.args.get("next")
            return redirect(next_page) if next_page else redirect(url_for("dashboard"))
        else:
            flash("Login Unsuccessful. Please check email and password", "danger")
    return render_template("login.html")


@app.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("home"))


@app.route("/dashboard", methods=["GET", "POST"])
@login_required
def dashboard():
    if request.method == "POST":
        farm_name = request.form.get("farm_name", "").strip()
        size_acres = request.form.get("size_acres")
        state = request.form.get("state")
        soil_type = request.form.get("soil_type")

        if farm_name and size_acres:
            try:
                profile = FarmProfile(
                    farm_name=farm_name,
                    size_acres=float(size_acres),
                    state=state,
                    soil_type=soil_type,
                    owner=current_user,
                )
                db.session.add(profile)
                db.session.commit()
                flash("Farm Profile created!", "success")
            except ValueError:
                flash("Invalid inputs given", "danger")
        return redirect(url_for("dashboard"))

    farms = FarmProfile.query.filter_by(user_id=current_user.id).all()
    saved_plans = SavedPlan.query.filter_by(user_id=current_user.id).all()
    return render_template("dashboard.html", farms=farms, saved_plans=saved_plans)


@app.route("/api/save_plan", methods=["POST"])
@login_required
def save_plan():
    data = request.json
    try:
        plan = SavedPlan(
            user_id=current_user.id,
            crop_name=data.get("crop_name"),
            score=data.get("score"),
            risk=data.get("risk"),
            season=data.get("season"),
        )
        db.session.add(plan)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.json
        if not data or not all(
            k in data
            for k in ["location", "rainfall", "temperature", "season", "soil_type"]
        ):
            return jsonify({"error": "Missing required fields"}), 400

        try:
            user_rainfall = float(data["rainfall"])
            user_temp = float(data["temperature"])
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid rainfall or temperature values"}), 400

        scored_crops: List[Dict[str, Any]] = []

        for crop_name, crop_data in CROP_DATABASE.items():
            result = calculate_crop_score(crop_name, crop_data, data)
            if result is None:
                continue
            scored_crops.append(
                {
                    "name": crop_name,
                    "icon": crop_data["icon"],
                    "color": crop_data["color"],
                    "description": crop_data["description"],
                    "water_need": crop_data["water_need"],
                    "growth_days": crop_data["growth_days"],
                    "market_value": crop_data["market_value"],
                    "protein": crop_data["protein"],
                    "optimal_rainfall": crop_data["optimal_rainfall"],
                    "optimal_temp": crop_data["optimal_temp"],
                    "irrigation": crop_data.get("irrigation"),
                    "economics": crop_data.get("economics"),
                    "calendar": crop_data.get("calendar"),
                    "rotation": crop_data.get("rotation"),
                    **result,
                }
            )

        scored_crops.sort(key=lambda x: x["score"], reverse=True)
        top_3 = [scored_crops[i] for i in range(min(3, len(scored_crops)))]

        # Weather history for chart
        location = data.get("location", "Punjab")
        hist = WEATHER_HISTORY.get(location, DEFAULT_WEATHER)

        climate_risk = get_climate_risk_score(user_rainfall, user_temp, location)

        weather_alerts = []
        try:
            coords = STATE_COORDS.get(
                location, (20.5937, 78.9629)
            )  # Default India centerish roughly
            url = f"https://api.open-meteo.com/v1/forecast?latitude={coords[0]}&longitude={coords[1]}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto"
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                forecast = resp.json()
                daily = forecast.get("daily", {})
                max_temps = daily.get("temperature_2m_max", [])
                min_temps = daily.get("temperature_2m_min", [])
                precip = daily.get("precipitation_sum", [])

                if max_temps and max(max_temps) > 40:
                    weather_alerts.append(
                        "🔥 Heatwave Warning: Temperatures expected to exceed 40°C in the next 7 days."
                    )
                if min_temps and min(min_temps) < 5:
                    weather_alerts.append(
                        "❄️ Frost Warning: Temperatures expected to drop below 5°C."
                    )
                if precip and sum(precip) < 2:
                    weather_alerts.append(
                        "🏜️ Drought Alert: Very low precipitation expected in the next week."
                    )
                elif precip and sum(precip) > 100:
                    weather_alerts.append(
                        "🌧️ Heavy Rain Alert: High precipitation expected. Ensure proper drainage."
                    )
        except Exception as e:
            print(f"Failed to fetch live weather: {e}", file=sys.stderr)

        return jsonify(
            {
                "recommendations": top_3,
                "all_crops": scored_crops,
                "weather_history": hist,
                "climate_risk_score": climate_risk,
                "location": location,
                "weather_alerts": weather_alerts,
            }
        )
    except Exception as e:
        print(f"Error in prediction: {e}", file=sys.stderr)
        return jsonify({"error": "An internal error occurred during prediction"}), 500


@app.route("/api/weather/<location>")
def get_weather(location):
    hist = WEATHER_HISTORY.get(location, DEFAULT_WEATHER)
    return jsonify(hist)


@app.route("/api/locations")
def get_locations():
    return jsonify(list(WEATHER_HISTORY.keys()))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
