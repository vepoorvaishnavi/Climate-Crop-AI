# 🌱 Climate Crop Planner

> AI-Powered Agricultural Intelligence for Resilient Farming

A professional hackathon-grade web application that helps farmers decide which crops are most resilient for the upcoming season using historical weather data and AI-driven prediction logic.

---

## 📁 Project Structure

```
climate-crop-planner/
├── app.py                    # Flask backend + ML prediction logic
├── requirements.txt          # Python dependencies
├── templates/
│   └── index.html            # Main HTML (Jinja2)
└── static/
    ├── css/
    │   └── style.css         # Full custom CSS (dark/light mode)
    └── js/
        └── script.js         # Frontend logic, charts, PDF export
```

---

## 🚀 How to Run Locally

### 1. Prerequisites
- Python 3.8+
- pip

### 2. Setup

```bash
# Clone or unzip the project
cd climate-crop-planner

# Install dependencies
pip install -r requirements.txt

# Run the Flask server
python app.py
```

### 3. Open in Browser

Visit: **http://localhost:5000**

---

## ✨ Features

| Feature | Description |
|---|---|
| 🧠 AI Crop Prediction | Scores 10 crops based on rainfall, temp, soil, season |
| 📊 Climate Risk Score | Animated ring indicator (0–100) |
| 🏆 Top 3 Recommendations | Cards with risk badge, yield stability bar, match scores |
| 📉 4 Chart Types | Rainfall bar, temperature line, radar, horizontal bar |
| 📋 Comparison Table | All crops ranked with full metrics |
| 📄 PDF Export | Download full report with jsPDF |
| 🌙 Dark / Light Mode | Toggle with persistence |
| 📱 Mobile Responsive | Works on all screen sizes |
| 🎨 Glassmorphism UI | Professional startup-grade design |
| ⌨️ Keyboard Shortcut | Ctrl+Enter to trigger prediction |

---

## 🌍 Supported Regions

Punjab · Maharashtra · Uttar Pradesh · Tamil Nadu · Gujarat · Rajasthan · West Bengal · Madhya Pradesh · Karnataka · Andhra Pradesh

---

## 🌾 Crops in Database

Rice · Wheat · Maize · Cotton · Soybean · Sugarcane · Groundnut · Tomato · Chickpea · Mustard

---

## 🛠 Tech Stack

- **Frontend**: HTML5, CSS3 (custom), JavaScript ES6+, TailwindCSS (CDN), Chart.js, jsPDF
- **Backend**: Python 3, Flask
- **Logic**: Custom scoring algorithm (rainfall + temperature + soil + season matching)
- **Fonts**: Syne (display) + DM Sans (body) — Google Fonts

---

Built for Hackathon 2025 🚀
