# Navya

> Smarter Energy Decisions for Every Community

Navya is an AI-powered microgrid energy mix optimizer designed for rural and off-grid communities. It intelligently balances solar, wind, battery storage, and diesel backup to deliver reliable, affordable, and sustainable electricity.

## Overview

Rural communities often rely on a combination of renewable energy sources and diesel generators to meet their electricity needs. Fluctuating weather conditions, changing energy demand, and limited resources make reliable power management a constant challenge.

Navya helps operators make informed decisions by forecasting demand, predicting energy shortfalls, and optimizing the use of available energy resources in real time.

## Key Features

- Demand and renewable energy forecasting
- Predictive shortfall detection
- Smart battery management
- Real-time energy mix optimization
- Diesel efficiency dispatch
- Critical load prioritization
- Interactive monitoring dashboard

## Unique Selling Proposition

### Predictive Shortfall Ladder™

Unlike traditional systems that react to power shortages after they occur, Navya predicts potential energy deficits in advance and takes progressive preventive actions to maintain reliable power supply.

## Workflow

```text
Forecast → Predict → Prevent → Optimize → Protect → Power
```

## Impact

- Reduced diesel dependency
- Lower operational costs
- Improved energy reliability
- Increased renewable energy utilization
- Sustainable rural development

## Technology Stack

**Frontend**
- React
- Tailwind CSS

**Backend**
- FastAPI
- Python

**AI & Optimization**
- Forecasting Models
- Optimization Algorithms

**Deployment**
- Vercel
- Render

## Getting Started

### Prerequisites
- Node.js 18+ & npm
- Python 3.10+

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The operator dashboard will be available at `http://localhost:3000` (connects to backend at `http://localhost:5000` by default).

### Backend Setup
```bash
cd backend
npm install
npm run dev
```

### Engine Setup
```bash
cd engine
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Future Scope

- IoT sensor integration
- Smart meter connectivity
- Mobile application
- Carbon savings analytics
- Multi-village microgrid coordination

## Vision

To empower rural and off-grid communities with intelligent, reliable, and sustainable energy management solutions that maximize renewable energy utilization while ensuring uninterrupted power supply.

---

**Navya — Predict. Optimize. Empower.**
