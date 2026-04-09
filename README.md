# 🎓 HOLBERTON AZ (DATANIST)

<div align="center">

![HOLBERTON AZ](https://img.shields.io/badge/HOLBERTON_AZ-EdTech_Platform-blue?style=for-the-badge)
![Flask](https://img.shields.io/badge/Flask-3.0.3-000000?style=for-the-badge&logo=flask&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![HTML/CSS/JS](https://img.shields.io/badge/HTML%2FCSS%2FJS-Frontend-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-AI_Learning_Plan-1A73E8?style=for-the-badge)

**Flask-based training platform for Holberton School AZ**
<br/>
*Role-based login • Exams • Scoring • AI learning plan (Gemini) • Mentor dashboard*

[Features](#-features) • [Demo Accounts](#-demo-accounts) • [Installation](#-installation) • [Architecture](#-architecture) • [Project Structure](#-project-structure)

</div>

---

## 🎯 Project Overview

**HOLBERTON AZ** is an initial web project built with **Flask + HTML/CSS/JS** for running and tracking student exams with role-based access.

| Traditional Flow | HOLBERTON AZ |
|------------------|--------------|
| ❌ Scattered exam tracking | ✅ Centralized exams + scores |
| ❌ Hard to monitor student progress | ✅ Mentor sees all students and results |
| ❌ No personalized follow-up | ✅ AI-generated learning plan per mistakes (Gemini) |
| ❌ Same UI for everyone | ✅ Role-based pages (Mentor / Student / SSM) |

---

## 🚀 Features

### 🔐 Role-Based Login (MVP)
Roles supported:
- **Mentor**
- **Student**
- **Student Success Manager (SSM)**

### 👩‍🎓 Student Capabilities
- View assigned exams
- Take exams and submit answers
- Receive a score
- Generate a **personalized learning plan** based on incorrect answers:
  - Uses **Gemini API** when `GEMINI_API_KEY` is configured
  - Falls back to a **demo plan** when API key is missing

### 🧑‍🏫 Mentor Capabilities
- Create new exams (topic, name, questions, options, correct answers)
- View all students and exam scores

---

## 👥 Demo Accounts

Use these credentials to explore roles:

- **Mentor:** `mentor@holberton.az` / `Mentor123!`
- **Student:** `student@holberton.az` / `Student123!`
- **SSM:** `ssm@holberton.az` / `SSM123!`

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Backend | Flask 3.0.3 |
| Frontend | HTML, CSS, JavaScript |
| Config | python-dotenv |
| AI Integration | Gemini (optional) |
| Document Parsing | pypdf, python-docx |
| HTTP Client | requests |
| Server | Werkzeug |

---

## 📦 Installation

### Prerequisites
- Python **3.11+**
- pip

### Steps
```bash
# Clone
git clone https://github.com/MR10587/DATANIST.git
cd DATANIST/DATANIST-NEW

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Environment variables
cp .env.example .env
# Edit .env and set at least:
# SECRET_KEY=...
# GEMINI_API_KEY=... (optional)
# RAPIDAPI_KEY=... (optional)

# Run the app
python run.py
```

### Example `.env`
```dotenv
SECRET_KEY=change-me
GEMINI_API_KEY=your-gemini-api-key-here
RAPIDAPI_KEY=your-rapidapi-key-here
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        HOLBERTON AZ                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐         ┌──────────────┐                    │
│  │   Student    │         │    Mentor     │                    │
│  │   Portal     │         │   Dashboard   │                    │
│  └──────┬──────┘         └──────┬───────┘                    │
│         │                       │                            │
│  ┌──────┴───────────────────────┴─────────────────────────┐  │
│  │                      Flask Application                   │  │
│  │     Auth + Role Checks + Exams + Scoring + Reports        │  │
│  └───────────────┬──────────────────────────────────────────┘  │
│                  │                                             │
│        ┌─────────┴─────────┐     ┌────────────────────────┐    │
│        │   Seed Data (JSON) │     │   AI Learning Plan      │    │
│        │ users/exams/scores │     │ Gemini (optional/demo)  │    │
│        └────────────────────┘     └────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

> The project lives under `DATANIST-NEW/`.

```
DATANIST-NEW/
├── run.py
├── requirements.txt
├── .env.example
├── README.md
└── app/
    ├── app.py
    ├── templates/
    ├── static/
    │   ├── css/
    │   └── js/
    └── data/
        └── seed_data.json
```

---

## ▶️ Running

```bash
python run.py
```
