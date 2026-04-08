# DATANIST-NEW

Holberton School AZ ucun Flask + HTML/CSS/JS ile qurulmus ilkin proyektdir.

## Hazir funksionallar

- Role-based login: Mentor, Student, SSM
- Student:
  - Mentorun teyin etdiyi imtahanlari gorur
  - Imtahana daxil olub cavablayir
  - Score alir
  - Yanlis cavablara gore Gemini API ile personalize learning plan alir (API key yoxdursa demo plan)
- Mentor:
  - Yeni exam yarada bilir (topic, name, suallar, variantlar, duzgun cavab)
  - Butun studentleri ve exam score-larini gorur
- SSM:
  - Helelik bos sehife

## Demo hesablar

- Mentor: mentor@holberton.az / Mentor123!
- Student: student@holberton.az / Student123!
- SSM: ssm@holberton.az / SSM123!

## Quraşdırma

1. Virtual environment yarat:
   - `python -m venv .venv`
2. Aktiv et (Windows):
   - `.venv\Scripts\activate`
3. Paketleri yukle:
   - `pip install -r requirements.txt`
4. `.env.example` faylini `.env` kimi kopyala ve doldur:
   - `SECRET_KEY`
   - `GEMINI_API_KEY`
5. Tətbiqi işə sal:
   - `python run.py`

## Struktur

- `app/app.py`: Flask backend
- `app/templates/`: HTML sehifeler
- `app/static/css/styles.css`: stiller
- `app/static/js/app.js`: frontend mentiqi
- `app/data/seed_data.json`: demo data (users, exams, scores)
