import json
import os
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "seed_data.json"

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "holberton-datanist-dev-secret")


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
        "created_by_role": interview.get("created_by_role", "mentor"),
        "created_by": interview.get("created_by", ""),
        "created_by_name": creator.get("name", interview.get("created_by", "")),
    }


def serialize_event(event: dict, current_user_id: str | None = None) -> dict:
    responses = event.get("responses", {})
    data = load_data()
    users_by_id = {user["id"]: user for user in data.get("users", [])}
    creator = users_by_id.get(event.get("created_by", ""), {})

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
            "created_by": user["id"],
            "questions": normalized_questions,
        }
    )
    save_data(data)

    return jsonify({"ok": True, "exam_id": exam_id})


@app.get("/api/mentor/students")
def mentor_students():
    user = require_role("mentor")
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
            }
        )

    return jsonify({"ok": True, "students": result})


if __name__ == "__main__":
    app.run(debug=True)
