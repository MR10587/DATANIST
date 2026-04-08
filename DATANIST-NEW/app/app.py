import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from werkzeug.utils import secure_filename

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - optional dependency
    try:
        from PyPDF2 import PdfReader
    except ImportError:  # pragma: no cover - optional dependency
        PdfReader = None

try:
    import docx
except ImportError:  # pragma: no cover - optional dependency
    docx = None

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "seed_data.json"
UPLOAD_DIR = BASE_DIR / "uploads" / "cv"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "holberton-datanist-dev-secret")
ATTENDANCE_WEEKLY_GOAL_HOURS = 15.0
LINKEDIN_API_URL = "https://linkedin-job-search-api.p.rapidapi.com/active-jb-7d"
LINKEDIN_API_HOST = "linkedin-job-search-api.p.rapidapi.com"


def load_data() -> dict:
    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data: dict) -> None:
    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None

    data = load_data()
    return next((u for u in data["users"] if u["id"] == user_id), None)


def require_role(*roles):
    user = get_current_user()
    if not user or user["role"] not in roles:
        return None
    return user


def normalize_date_input(value: str) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None

    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            parsed = datetime.strptime(raw, fmt)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def parse_date_value(value: str):
    normalized = normalize_date_input(value)
    if not normalized:
        return None

    try:
        return datetime.strptime(normalized, "%Y-%m-%d").date()
    except ValueError:
        return None


def is_within_next_days(date_value: str, days: int = 7) -> bool:
    parsed_date = parse_date_value(date_value)
    if not parsed_date:
        return False

    today = datetime.utcnow().date()
    delta_days = (parsed_date - today).days
    return 0 <= delta_days <= days


def parse_datetime_input(value: str):
    raw = str(value or "").strip()
    if not raw:
        return None

    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def get_week_bounds(reference: datetime):
    start = reference.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=reference.weekday())
    end = start + timedelta(days=7)
    return start, end


def compute_overlap_hours(start_dt: datetime, end_dt: datetime, week_start: datetime, week_end: datetime) -> float:
    overlap_start = max(start_dt, week_start)
    overlap_end = min(end_dt, week_end)
    if overlap_end <= overlap_start:
        return 0.0
    return (overlap_end - overlap_start).total_seconds() / 3600.0


def get_attendance_logs(data: dict) -> dict:
    return data.setdefault("attendance_logs", {})


def serialize_student_attendance(student_id: str, data: dict) -> dict:
    logs = get_attendance_logs(data).setdefault(student_id, [])
    now = datetime.utcnow()
    week_start, week_end = get_week_bounds(now)

    weekly_hours = 0.0
    active_session = None
    week_sessions = []

    for entry in logs:
        check_in = parse_datetime_input(entry.get("check_in_at", ""))
        if not check_in:
            continue

        check_out = parse_datetime_input(entry.get("check_out_at", ""))
        is_open = check_out is None
        effective_end = check_out or now

        if effective_end <= check_in:
            continue

        overlap_hours = compute_overlap_hours(check_in, effective_end, week_start, week_end)
        weekly_hours += overlap_hours

        if overlap_hours > 0:
            week_sessions.append(
                {
                    "id": entry.get("id"),
                    "check_in_at": entry.get("check_in_at", ""),
                    "check_out_at": entry.get("check_out_at", ""),
                    "duration_hours": round((effective_end - check_in).total_seconds() / 3600.0, 2),
                    "is_open": is_open,
                }
            )

        if is_open and not active_session:
            active_session = {
                "id": entry.get("id"),
                "check_in_at": entry.get("check_in_at", ""),
                "duration_hours": round((now - check_in).total_seconds() / 3600.0, 2),
            }

    weekly_hours = round(weekly_hours, 2)
    progress_percent = round(min((weekly_hours / ATTENDANCE_WEEKLY_GOAL_HOURS) * 100.0, 100.0), 1)
    goal_reached = weekly_hours >= ATTENDANCE_WEEKLY_GOAL_HOURS

    return {
        "goal_hours": ATTENDANCE_WEEKLY_GOAL_HOURS,
        "weekly_hours": weekly_hours,
        "progress_percent": progress_percent,
        "goal_reached": goal_reached,
        "active_session": active_session,
        "week_start": week_start.strftime("%Y-%m-%d"),
        "week_end": (week_end - timedelta(days=1)).strftime("%Y-%m-%d"),
        "week_sessions": sorted(week_sessions, key=lambda item: item.get("check_in_at", ""), reverse=True),
    }


def _normalize_job_item(job: dict) -> dict:
    title = (
        job.get("title")
        or job.get("job_title")
        or job.get("position")
        or job.get("name")
        or "Unknown role"
    )
    company = (
        job.get("company")
        or job.get("company_name")
        or job.get("organization")
        or job.get("companyName")
        or "Unknown company"
    )
    location = (
        job.get("location")
        or job.get("job_location")
        or job.get("formatted_location")
        or "Location not specified"
    )
    link = (
        job.get("job_url")
        or job.get("url")
        or job.get("linkedin_url")
        or job.get("link")
        or ""
    )
    listed_at = (
        job.get("date")
        or job.get("listed_at")
        or job.get("published_at")
        or ""
    )

    return {
        "title": str(title).strip(),
        "company": str(company).strip(),
        "location": str(location).strip(),
        "link": str(link).strip(),
        "listed_at": str(listed_at).strip(),
        "description": str(job.get("description") or job.get("job_description") or "").strip(),
    }


def infer_student_job_preferences(student_id: str, data: dict) -> dict:
    profile = get_student_profiles(data).get(student_id, {})
    cv_keywords = [str(item).lower() for item in profile.get("cv_keywords", []) if str(item).strip()]
    motivation = str(profile.get("motivation_letter", "")).lower()

    exam_topics = []
    student_scores = data.get("scores", {}).get(student_id, {})
    exams_by_id = {exam.get("id"): exam for exam in data.get("exams", [])}
    for exam_id in student_scores.keys():
        exam = exams_by_id.get(exam_id, {})
        topic = str(exam.get("topic", "")).strip().lower()
        if topic:
            exam_topics.append(topic)

    combined_tokens = set(cv_keywords + exam_topics)
    combined_text = " ".join(list(combined_tokens) + [motivation])

    role_by_signal = [
        ("data", "Data Engineer"),
        ("python", "Python Developer"),
        ("backend", "Backend Developer"),
        ("flask", "Backend Developer"),
        ("api", "Backend Developer"),
        ("javascript", "Frontend Developer"),
        ("react", "Frontend Developer"),
        ("full stack", "Full Stack Developer"),
        ("software", "Software Engineer"),
        ("oop", "Software Engineer"),
    ]

    inferred_roles = []
    for signal, role in role_by_signal:
        if signal in combined_text and role not in inferred_roles:
            inferred_roles.append(role)

    if not inferred_roles:
        inferred_roles = ["Software Engineer", "Backend Developer", "Data Engineer"]

    return {
        "title_filter": " OR ".join([f'"{role}"' for role in inferred_roles[:4]]),
        "location_filter": "",
        "keywords": list(combined_tokens),
    }


def score_job_match(job_item: dict, keywords: list[str]) -> int:
    if not keywords:
        return 0

    title = str(job_item.get("title", "")).lower()
    description = str(job_item.get("description", "")).lower()
    haystack = f"{title} {description}"
    score = 0

    for keyword in keywords:
        cleaned = str(keyword).strip().lower()
        if not cleaned:
            continue
        if cleaned in title:
            score += 3
        elif cleaned in haystack:
            score += 1

    return score


def fetch_linkedin_developer_jobs(
    limit: int = 8,
    title_filter: str = '"Data Engineer"',
    location_filter: str = "",
    keywords: list[str] | None = None,
) -> tuple[list[dict], str | None]:
    rapidapi_key = os.getenv("RAPIDAPI_KEY", "").strip()
    if not rapidapi_key:
        return [], "RAPIDAPI_KEY is not configured."

    headers = {
        "Content-Type": "application/json",
        "x-rapidapi-host": LINKEDIN_API_HOST,
        "x-rapidapi-key": rapidapi_key,
    }
    params = {
        "limit": str(max(1, min(limit, 10))),
        "offset": "0",
        "title_filter": title_filter,
        "description_type": "text",
    }
    if location_filter.strip():
        params["location_filter"] = location_filter.strip()

    try:
        response = requests.get(LINKEDIN_API_URL, headers=headers, params=params, timeout=20)
        response.raise_for_status()
        payload = response.json()

        if isinstance(payload, dict):
            raw_items = payload.get("data") or payload.get("results") or payload.get("jobs") or []
        elif isinstance(payload, list):
            raw_items = payload
        else:
            raw_items = []

        normalized = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            normalized_item = _normalize_job_item(item)
            role = normalized_item["title"].lower()
            if any(keyword in role for keyword in ("developer", "engineer", "software", "backend", "frontend", "full stack", "data")):
                normalized.append(normalized_item)

        if normalized:
            scored = []
            for item in normalized:
                item_score = score_job_match(item, keywords or [])
                scored.append((item_score, item))

            scored.sort(key=lambda pair: pair[0], reverse=True)
            ranked = [item for _, item in scored]
            for item in ranked:
                item.pop("description", None)
            return ranked[:limit], None
        return [], "No suitable jobs found in the last 7 days."
    except Exception as exc:
        return [], f"LinkedIn API request failed: {str(exc)}"


def derive_weak_topics(wrong_questions: list[str]) -> list[str]:
    weak_topics = []
    for question in wrong_questions:
        normalized = question.replace("?", "").replace("!", "").strip()
        if not normalized:
            continue

        words = normalized.split()
        if len(words) <= 4:
            weak_topics.append(normalized)
        else:
            weak_topics.append(" ".join(words[:4]))

    if not weak_topics:
        weak_topics = ["General exam concepts"]

    return weak_topics[:3]


STOP_WORDS = {
    "a",
    "about",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "with",
    "what",
    "which",
    "why",
    "you",
    "your",
}


def extract_cv_text(cv_path: Path) -> str:
    suffix = cv_path.suffix.lower()
    collected: list[str] = []

    if suffix == ".pdf" and PdfReader:
        try:
            reader = PdfReader(str(cv_path))
            for page in reader.pages[:5]:
                page_text = page.extract_text() or ""
                if page_text.strip():
                    collected.append(page_text.strip())
        except Exception:
            return ""
    elif suffix == ".docx" and docx:
        try:
            document = docx.Document(str(cv_path))
            for paragraph in document.paragraphs[:50]:
                if paragraph.text.strip():
                    collected.append(paragraph.text.strip())
        except Exception:
            return ""

    return "\n".join(collected).strip()


def extract_cv_keywords(cv_text: str) -> list[str]:
    if not cv_text:
        return []

    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}", cv_text.lower())
    filtered = [token for token in tokens if token not in STOP_WORDS]
    counts = Counter(filtered)
    return [word for word, _ in counts.most_common(6)]


def build_profile_insights(profile: dict) -> dict:
    motivation_letter = str(profile.get("motivation_letter", "")).strip()
    cv_filename = profile.get("cv_filename")
    cv_keywords = profile.get("cv_keywords", []) or []
    cv_excerpt = str(profile.get("cv_excerpt", "")).strip()

    score = 0
    notes = []

    if motivation_letter:
        score += 35
        if len(motivation_letter) < 120:
            notes.append("Expand the motivation letter with goals, projects, and role interests.")
    else:
        notes.append("Add a motivation letter.")

    if cv_filename:
        score += 35
        if cv_keywords:
            score += 20
        else:
            notes.append("Upload a parsable PDF or DOCX CV to extract skills automatically.")
    else:
        notes.append("Upload a CV.")

    if cv_excerpt:
        score += 10

    if score >= 90:
        status = "Strong profile"
    elif score >= 60:
        status = "In progress"
    else:
        status = "Needs attention"

    return {
        "profile_completeness": min(score, 100),
        "profile_status": status,
        "profile_notes": notes[:3],
        "cv_keywords": cv_keywords[:5],
        "cv_excerpt": cv_excerpt[:220],
    }


def build_learning_plan(weak_topics: list[str], wrong_questions: list[str], score: int, total: int) -> str:
    missed = max(total - score, 0)
    topics = weak_topics or derive_weak_topics(wrong_questions)
    lines = [f"You missed {missed} question(s) and scored {score}/{total}."]

    for index, topic in enumerate(topics, start=1):
        lines.append(f"{index}) Study the core idea behind '{topic}' and summarize it in your own words.")
        lines.append(f"{index}) Do 5 focused practice questions on '{topic}' and review every mistake immediately.")
        lines.append(f"{index}) Re-attempt the missed question without looking at the answer, then compare.")

    lines.append("Final step: schedule a short mentor review and retest the same topics within 48 hours.")
    return "\n".join(lines)


def fallback_gemini_analysis(wrong_questions: list[str], score: int, total: int, weak_topics: list[str] | None = None) -> dict:
    topics = weak_topics or derive_weak_topics(wrong_questions)
    learning_plan = build_learning_plan(topics, wrong_questions, score, total)
    return {"weak_topics": topics, "learning_plan": learning_plan}


def get_gemini_analysis(exam_name: str, score: int, total: int, wrong_questions: list[str]) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return fallback_gemini_analysis(wrong_questions, score, total)

    weak_topic_hints = derive_weak_topics(wrong_questions)
    prompt = (
        "You are an educational mentor for Holberton students. "
        "Analyze the student's incorrect answers and return strict JSON only with keys weak_topics and learning_plan. "
        "weak_topics must be an array of short English skill/topic strings that explain what the student should improve, "
        "not the full question text. "
        "learning_plan must be highly specific to those weak topics and must not be generic. "
        "For each weak topic, include what to study, what kind of practice to do, and a short review schedule. "
        "Use English only. Keep the plan concise but actionable. "
        f"Exam: {exam_name}. Score: {score}/{total}. Incorrect questions: {wrong_questions}. "
        f"Possible weak topic hints: {weak_topic_hints}. "
        "If the score is low, prioritize the two most important skill gaps. "
        "Return valid JSON with this exact shape: {\"weak_topics\": [\"topic 1\", \"topic 2\"], \"learning_plan\": \"1) ...\\n2) ...\"}."
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-1.5-flash:generateContent"
    )
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }

    try:
        response = requests.post(
            f"{url}?key={api_key}",
            headers=headers,
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        result = response.json()
        text = (
            result.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
            .strip()
        )

        if text.startswith("```"):
            text = text.replace("```json", "").replace("```", "").strip()

        parsed = json.loads(text)
        weak_topics = parsed.get("weak_topics", [])
        learning_plan = parsed.get("learning_plan", "")

        if not isinstance(weak_topics, list) or not isinstance(learning_plan, str):
            return fallback_gemini_analysis(wrong_questions, score, total, weak_topic_hints)

        cleaned_topics = [str(x).strip() for x in weak_topics if str(x).strip()]
        if not cleaned_topics:
            cleaned_topics = weak_topic_hints

        return {
            "weak_topics": cleaned_topics,
            "learning_plan": learning_plan.strip() or build_learning_plan(cleaned_topics, wrong_questions, score, total),
        }
    except Exception:
        return fallback_gemini_analysis(wrong_questions, score, total, weak_topic_hints)


def serialize_interview(interview: dict, current_user_id: str | None = None) -> dict:
    bookings = interview.get("bookings", {})
    booked_time_options = list(bookings.values())
    booked_by_me = current_user_id in bookings
    capacity = len(interview.get("time_options", []))
    booking_count = len(bookings)
    data = load_data()
    users_by_id = {user["id"]: user for user in data.get("users", [])}
    creator = users_by_id.get(interview.get("created_by", ""), {})

    booking_details = [
        {
            "student_id": student_id,
            "student_name": users_by_id.get(student_id, {}).get("name", student_id),
            "time": time_option,
        }
        for student_id, time_option in bookings.items()
    ]

    return {
        "id": interview["id"],
        "title": interview["title"],
        "date": interview["date"],
        "time_options": interview.get("time_options", []),
        "available_time_options": [
            time_option for time_option in interview.get("time_options", []) if time_option not in booked_time_options
        ],
        "bookings": bookings,
        "booking_details": booking_details,
        "booked_by_me": booked_by_me,
        "my_booking_time": bookings.get(current_user_id),
        "booking_count": booking_count,
        "capacity": capacity,
        "booking_rate": round((booking_count / capacity) * 100, 1) if capacity else 0,
        "created_by_role": interview.get("created_by_role", "mentor"),
        "created_by": interview.get("created_by", ""),
        "created_by_name": creator.get("name", interview.get("created_by", "")),
    }


def serialize_event(event: dict, current_user_id: str | None = None) -> dict:
    responses = event.get("responses", {})
    data = load_data()
    users_by_id = {user["id"]: user for user in data.get("users", [])}
    creator = users_by_id.get(event.get("created_by", ""), {})
    join_count = sum(1 for decision in responses.values() if decision == "join")
    not_join_count = sum(1 for decision in responses.values() if decision == "not_join")
    response_count = len(responses)

    joined_students = [
        {
            "student_id": student_id,
            "student_name": users_by_id.get(student_id, {}).get("name", student_id),
        }
        for student_id, decision in responses.items()
        if decision == "join"
    ]

    return {
        "id": event["id"],
        "name": event["name"],
        "description": event["description"],
        "date": event["date"],
        "time": event.get("time", ""),
        "created_by": event.get("created_by", ""),
        "created_by_role": event.get("created_by_role", "mentor"),
        "created_by_name": creator.get("name", event.get("created_by", "")),
        "responses": responses,
        "my_decision": responses.get(current_user_id),
        "joined_students": joined_students,
        "is_creator": event.get("created_by") == current_user_id,
        "join_count": join_count,
        "not_join_count": not_join_count,
        "response_count": response_count,
        "response_rate": round((response_count / max(len(data.get("users", [])) - 1, 1)) * 100, 1),
    }


def get_student_profiles(data: dict) -> dict:
    return data.setdefault("student_profiles", {})


def serialize_student_profile(student_id: str, data: dict) -> dict:
    profiles = get_student_profiles(data)
    profile = profiles.get(student_id, {})
    insights = build_profile_insights(profile)
    cv_filename = profile.get("cv_filename")
    return {
        "motivation_letter": profile.get("motivation_letter", ""),
        "cv_filename": cv_filename,
        "cv_url": url_for("get_cv_file", filename=cv_filename) if cv_filename else None,
        "updated_at": profile.get("updated_at", ""),
        "cv_keywords": insights["cv_keywords"],
        "cv_excerpt": insights["cv_excerpt"],
        "profile_completeness": insights["profile_completeness"],
        "profile_status": insights["profile_status"],
        "profile_notes": insights["profile_notes"],
    }


@app.route("/")
def root():
    if get_current_user():
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    payload = request.get_json(silent=True) or request.form
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")

    data = load_data()
    user = next(
        (u for u in data["users"] if u["email"].lower() == email and u["password"] == password),
        None,
    )

    if not user:
        return jsonify({"ok": False, "message": "Email or password is incorrect."}), 401

    session["user_id"] = user["id"]
    return jsonify({"ok": True, "role": user["role"], "redirect": url_for("dashboard")})


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/dashboard")
def dashboard():
    user = get_current_user()
    if not user:
        return redirect(url_for("login"))

    if user["role"] == "student":
        return redirect(url_for("student_page"))
    if user["role"] == "mentor":
        return redirect(url_for("mentor_page"))
    return redirect(url_for("ssm_page"))


@app.route("/student")
def student_page():
    user = require_role("student")
    if not user:
        return redirect(url_for("login"))
    return render_template("student.html", user=user)


@app.route("/student/exams/<exam_id>")
def student_exam_page(exam_id: str):
    user = require_role("student")
    if not user:
        return redirect(url_for("login"))

    data = load_data()
    exam = next((e for e in data.get("exams", []) if e.get("id") == exam_id), None)
    if not exam:
        return redirect(url_for("student_page"))

    return render_template("student_exam.html", user=user, exam_id=exam_id)


@app.route("/mentor")
def mentor_page():
    user = require_role("mentor")
    if not user:
        return redirect(url_for("login"))
    return render_template("mentor.html", user=user)


@app.route("/ssm")
def ssm_page():
    user = require_role("ssm")
    if not user:
        return redirect(url_for("login"))
    return render_template("ssm.html", user=user)


@app.get("/uploads/cv/<filename>")
def get_cv_file(filename: str):
    user = get_current_user()
    if not user:
        return redirect(url_for("login"))
    return send_from_directory(UPLOAD_DIR, filename)


@app.get("/api/interviews")
def list_interviews():
    user = get_current_user()
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    interviews = data.get("interviews", [])

    if user["role"] == "student":
        items = [serialize_interview(interview, user["id"]) for interview in interviews]
    else:
        items = [
            serialize_interview(interview, user["id"])
            for interview in interviews
            if interview.get("created_by") == user["id"]
        ]

    return jsonify({"ok": True, "interviews": items})


@app.post("/api/interviews")
def create_interview():
    user = require_role("mentor", "ssm")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    title = payload.get("title", "").strip()
    date = normalize_date_input(payload.get("date", ""))
    time_options = payload.get("time_options", [])

    normalized_times = []
    for time_option in time_options:
        value = str(time_option).strip()
        if value:
            normalized_times.append(value)

    if not title or not date or not normalized_times:
        return jsonify({"ok": False, "message": "Interview details are incomplete."}), 400

    data = load_data()
    interview_id = f"interview-{len(data.get('interviews', [])) + 1}"
    data.setdefault("interviews", []).append(
        {
            "id": interview_id,
            "title": title,
            "date": date,
            "created_by": user["id"],
            "created_by_role": user["role"],
            "time_options": normalized_times,
            "bookings": {},
        }
    )
    save_data(data)

    return jsonify({"ok": True, "interview_id": interview_id})


@app.post("/api/interviews/<interview_id>/book")
def book_interview(interview_id: str):
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    selected_time = str(payload.get("time_option", "")).strip()

    data = load_data()
    interview = next((item for item in data.get("interviews", []) if item["id"] == interview_id), None)
    if not interview:
        return jsonify({"ok": False, "message": "Interview not found."}), 404

    if user["id"] in interview.get("bookings", {}):
        return jsonify({"ok": False, "message": "You have already booked this interview."}), 403

    if selected_time not in interview.get("time_options", []):
        return jsonify({"ok": False, "message": "Selected time is not available."}), 400

    if selected_time in interview.get("bookings", {}).values():
        return jsonify({"ok": False, "message": "Selected time has already been booked."}), 409

    interview.setdefault("bookings", {})[user["id"]] = selected_time
    save_data(data)

    return jsonify({"ok": True, "message": "Interview booked successfully."})


@app.get("/api/events")
def list_events():
    user = get_current_user()
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    events = data.get("events", [])
    items = [serialize_event(event, user["id"]) for event in events]
    return jsonify({"ok": True, "events": items})


@app.post("/api/events")
def create_event():
    user = require_role("mentor", "ssm")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    name = payload.get("name", "").strip()
    description = payload.get("description", "").strip()
    date = normalize_date_input(payload.get("date", ""))
    time = str(payload.get("time", "")).strip()

    if not name or not description or not date or not time:
        return jsonify({"ok": False, "message": "Event details are incomplete."}), 400

    try:
        datetime.strptime(time, "%H:%M")
    except ValueError:
        return jsonify({"ok": False, "message": "Event time must be in HH:MM format."}), 400

    data = load_data()
    event_id = f"event-{len(data.get('events', [])) + 1}"
    data.setdefault("events", []).append(
        {
            "id": event_id,
            "name": name,
            "description": description,
            "date": date,
            "time": time,
            "created_by": user["id"],
            "created_by_role": user["role"],
            "responses": {},
        }
    )
    save_data(data)

    return jsonify({"ok": True, "event_id": event_id})


@app.post("/api/events/<event_id>/rsvp")
def rsvp_event(event_id: str):
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    decision = str(payload.get("decision", "")).strip().lower()

    if decision not in {"join", "not_join"}:
        return jsonify({"ok": False, "message": "Invalid RSVP decision."}), 400

    data = load_data()
    event = next((item for item in data.get("events", []) if item["id"] == event_id), None)
    if not event:
        return jsonify({"ok": False, "message": "Event not found."}), 404

    event.setdefault("responses", {})[user["id"]] = decision
    save_data(data)

    return jsonify({"ok": True, "message": "RSVP updated."})


@app.get("/api/student/profile")
def get_student_profile():
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    return jsonify({"ok": True, "profile": serialize_student_profile(user["id"], data)})


@app.get("/api/student/career-jobs")
def get_student_career_jobs():
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    preferences = infer_student_job_preferences(user["id"], data)
    jobs, error_message = fetch_linkedin_developer_jobs(
        limit=8,
        title_filter=preferences["title_filter"],
        location_filter=preferences["location_filter"],
        keywords=preferences["keywords"],
    )
    if error_message:
        return jsonify({"ok": False, "message": error_message, "jobs": jobs}), 502
    return jsonify({"ok": True, "jobs": jobs})


@app.get("/api/student/attendance")
def get_student_attendance():
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    attendance = serialize_student_attendance(user["id"], data)
    return jsonify({"ok": True, "attendance": attendance})


@app.post("/api/student/attendance/checkin")
def student_attendance_checkin():
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    requested_check_in = parse_datetime_input(payload.get("check_in_at", "")) or datetime.utcnow()

    data = load_data()
    logs = get_attendance_logs(data).setdefault(user["id"], [])

    active = next((entry for entry in logs if not entry.get("check_out_at")), None)
    if active:
        return jsonify({"ok": False, "message": "You already have an active campus session."}), 409

    entry_id = f"attendance-{len(logs) + 1}"
    logs.append(
        {
            "id": entry_id,
            "check_in_at": requested_check_in.strftime("%Y-%m-%dT%H:%M:%S"),
            "check_out_at": "",
        }
    )
    save_data(data)

    attendance = serialize_student_attendance(user["id"], data)
    return jsonify({"ok": True, "message": "Check-in saved.", "attendance": attendance})


@app.post("/api/student/attendance/checkout")
def student_attendance_checkout():
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    requested_check_out = parse_datetime_input(payload.get("check_out_at", "")) or datetime.utcnow()

    data = load_data()
    logs = get_attendance_logs(data).setdefault(user["id"], [])
    active = next((entry for entry in reversed(logs) if not entry.get("check_out_at")), None)

    if not active:
        return jsonify({"ok": False, "message": "No active check-in found."}), 404

    check_in = parse_datetime_input(active.get("check_in_at", ""))
    if not check_in:
        return jsonify({"ok": False, "message": "Active session has an invalid check-in time."}), 400

    if requested_check_out <= check_in:
        return jsonify({"ok": False, "message": "Check-out time must be after check-in time."}), 400

    active["check_out_at"] = requested_check_out.strftime("%Y-%m-%dT%H:%M:%S")
    active["duration_hours"] = round((requested_check_out - check_in).total_seconds() / 3600.0, 2)
    save_data(data)

    attendance = serialize_student_attendance(user["id"], data)
    return jsonify({"ok": True, "message": "Check-out saved.", "attendance": attendance})


@app.post("/api/student/profile")
def update_student_profile():
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    profiles = get_student_profiles(data)
    current_profile = profiles.get(user["id"], {})

    motivation_letter = request.form.get("motivation_letter", "").strip()
    cv_file = request.files.get("cv_file")
    cv_filename = current_profile.get("cv_filename")

    if cv_file and cv_file.filename:
        safe_name = secure_filename(cv_file.filename)
        if not safe_name:
            return jsonify({"ok": False, "message": "Invalid CV filename."}), 400

        extension = Path(safe_name).suffix.lower()
        if extension not in {".pdf", ".doc", ".docx"}:
            return jsonify({"ok": False, "message": "CV file must be PDF, DOC, or DOCX."}), 400

        stamped_name = f"{user['id']}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{extension}"
        cv_path = UPLOAD_DIR / stamped_name
        cv_file.save(cv_path)
        cv_filename = stamped_name

    cv_keywords = []
    cv_excerpt = ""
    if cv_filename:
        cv_path = UPLOAD_DIR / cv_filename
        cv_text = extract_cv_text(cv_path)
        cv_keywords = extract_cv_keywords(cv_text)
        cv_excerpt = cv_text[:220]

    profiles[user["id"]] = {
        "motivation_letter": motivation_letter,
        "cv_filename": cv_filename,
        "cv_keywords": cv_keywords,
        "cv_excerpt": cv_excerpt,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    save_data(data)

    return jsonify({"ok": True, "profile": serialize_student_profile(user["id"], data)})


@app.get("/api/student/exams")
def student_exams():
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    scores = data.get("scores", {}).get(user["id"], {})

    items = []
    for exam in data.get("exams", []):
        score_data = scores.get(exam["id"])
        items.append(
            {
                "id": exam["id"],
                "name": exam["name"],
                "topic": exam["topic"],
                "requirements": exam.get("requirements", ""),
                "question_count": len(exam.get("questions", [])),
                "attempted": score_data is not None,
                "score": score_data.get("score") if score_data else None,
                "total": score_data.get("total") if score_data else None,
                "weak_topics": score_data.get("weak_topics", []) if score_data else [],
                "learning_plan": score_data.get("learning_plan", "") if score_data else "",
                "submitted_at": score_data.get("submitted_at", "") if score_data else "",
            }
        )

    return jsonify({"ok": True, "exams": items})


@app.get("/api/student/exams/<exam_id>")
def student_exam_detail(exam_id: str):
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    existing_score = data.get("scores", {}).get(user["id"], {}).get(exam_id)
    if existing_score:
        return jsonify({"ok": False, "message": "This exam has already been submitted."}), 403

    exam = next((e for e in data.get("exams", []) if e["id"] == exam_id), None)
    if not exam:
        return jsonify({"ok": False, "message": "Exam not found."}), 404

    safe_exam = {
        "id": exam["id"],
        "name": exam["name"],
        "topic": exam["topic"],
        "requirements": exam.get("requirements", ""),
        "questions": [
            {
                "id": q["id"],
                "text": q["text"],
                "options": q["options"],
            }
            for q in exam.get("questions", [])
        ],
    }
    return jsonify({"ok": True, "exam": safe_exam})


@app.post("/api/student/exams/<exam_id>/submit")
def submit_exam(exam_id: str):
    user = require_role("student")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    answers = payload.get("answers", {})

    data = load_data()
    existing_score = data.get("scores", {}).get(user["id"], {}).get(exam_id)
    if existing_score:
        return jsonify({"ok": False, "message": "This exam has already been submitted."}), 403

    exam = next((e for e in data.get("exams", []) if e["id"] == exam_id), None)
    if not exam:
        return jsonify({"ok": False, "message": "Exam not found."}), 404

    total = len(exam.get("questions", []))
    score = 0
    wrong_questions = []

    for question in exam.get("questions", []):
        selected = answers.get(question["id"])
        if selected == question["correct_option"]:
            score += 1
        else:
            wrong_questions.append(question["text"])

    if score == total:
        analysis = {
            "weak_topics": [],
            "learning_plan": "Congratulations! You got a perfect score. Keep practicing to maintain your level.",
        }
    else:
        analysis = get_gemini_analysis(exam["name"], score, total, wrong_questions)

    data.setdefault("scores", {}).setdefault(user["id"], {})[exam_id] = {
        "score": score,
        "total": total,
        "wrong_questions": wrong_questions,
        "weak_topics": analysis["weak_topics"],
        "learning_plan": analysis["learning_plan"],
        "submitted_at": datetime.utcnow().isoformat() + "Z",
    }
    save_data(data)

    return jsonify(
        {
            "ok": True,
            "score": score,
            "total": total,
            "wrong_questions": wrong_questions,
            "weak_topics": analysis["weak_topics"],
            "learning_plan": analysis["learning_plan"],
            "congratulations": score == total,
        }
    )


@app.post("/api/mentor/exams")
def create_exam():
    user = require_role("mentor")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}

    name = payload.get("name", "").strip()
    topic = payload.get("topic", "").strip()
    requirements = payload.get("requirements", "").strip()
    questions = payload.get("questions", [])

    if not name or not topic or not questions:
        return jsonify({"ok": False, "message": "Exam details are incomplete."}), 400

    data = load_data()
    exam_id = f"exam-{len(data.get('exams', [])) + 1}"

    normalized_questions = []
    for idx, q in enumerate(questions, start=1):
        q_text = q.get("text", "").strip()
        options = q.get("options", [])
        correct = q.get("correct_option")

        if isinstance(correct, str):
            mapping = {"A": 0, "B": 1, "C": 2, "D": 3}
            correct = mapping.get(correct.strip().upper())

        if not q_text or len(options) < 2:
            return jsonify({"ok": False, "message": f"Question {idx} has an invalid format."}), 400
        if correct is None or correct < 0 or correct >= len(options):
            return jsonify({"ok": False, "message": f"Question {idx} does not have a valid correct option."}), 400

        normalized_questions.append(
            {
                "id": f"q{idx}",
                "text": q_text,
                "options": options,
                "correct_option": correct,
            }
        )

    data.setdefault("exams", []).append(
        {
            "id": exam_id,
            "name": name,
            "topic": topic,
            "requirements": requirements,
            "created_by": user["id"],
            "questions": normalized_questions,
        }
    )
    save_data(data)

    return jsonify({"ok": True, "exam_id": exam_id})


@app.get("/api/mentor/exams")
def list_mentor_exams():
    user = require_role("mentor")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    exams = [
        {
            "id": exam["id"],
            "name": exam.get("name", ""),
            "topic": exam.get("topic", ""),
            "requirements": exam.get("requirements", ""),
            "question_count": len(exam.get("questions", [])),
        }
        for exam in data.get("exams", [])
        if exam.get("created_by") == user["id"]
    ]
    return jsonify({"ok": True, "exams": exams})


@app.post("/api/mentor/exams/<exam_id>/requirements")
def update_exam_requirements(exam_id: str):
    user = require_role("mentor")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    requirements = str(payload.get("requirements", "")).strip()

    data = load_data()
    exam = next(
        (item for item in data.get("exams", []) if item.get("id") == exam_id and item.get("created_by") == user["id"]),
        None,
    )
    if not exam:
        return jsonify({"ok": False, "message": "Exam not found."}), 404

    exam["requirements"] = requirements
    exam["requirements_updated_at"] = datetime.utcnow().isoformat() + "Z"
    save_data(data)

    return jsonify({"ok": True, "message": "Requirements updated.", "requirements": requirements})


@app.get("/api/mentor/students")
def mentor_students():
    user = require_role("mentor", "ssm")
    if not user:
        return jsonify({"ok": False, "message": "Unauthorized"}), 401

    data = load_data()
    students = [u for u in data.get("users", []) if u["role"] == "student"]
    result = []

    for student in students:
        student_scores = data.get("scores", {}).get(student["id"], {})
        exam_scores = []
        latest_analysis = None

        for exam in data.get("exams", []):
            item = student_scores.get(exam["id"])
            if item:
                submitted_at = item.get("submitted_at", "")
                exam_scores.append(
                    {
                        "exam_id": exam["id"],
                        "exam_name": exam["name"],
                        "score": item["score"],
                        "total": item["total"],
                        "weak_topics": item.get("weak_topics", []),
                        "learning_plan": item.get("learning_plan", ""),
                        "submitted_at": submitted_at,
                    }
                )

                if not latest_analysis or submitted_at > latest_analysis.get("submitted_at", ""):
                    latest_analysis = {
                        "exam_name": exam["name"],
                        "weak_topics": item.get("weak_topics", []),
                        "learning_plan": item.get("learning_plan", ""),
                        "submitted_at": submitted_at,
                    }
        result.append(
            {
                "student_id": student["id"],
                "name": student["name"],
                "email": student["email"],
                "exam_scores": exam_scores,
                "latest_analysis": latest_analysis,
                "profile": serialize_student_profile(student["id"], data),
            }
        )

    return jsonify({"ok": True, "students": result})


if __name__ == "__main__":
    app.run(debug=True)
