async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

function byId(id) {
  return document.getElementById(id);
}

function optionLetterToIndex(letter) {
  const map = { A: 0, B: 1, C: 2, D: 3 };
  return map[String(letter || "").toUpperCase()];
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const local = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!local) return null;

  const [, dd, mm, yyyy] = local;
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDisplay(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return String(value || "");

  const [yyyy, mm, dd] = normalized.split("-");
  return `${dd}.${mm}.${yyyy}`;
}

function renderInterviewCard(interview, mode = "student") {
  const card = document.createElement("div");
  card.className = "exam-item";

  const bookedCount = Object.keys(interview.bookings || {}).length;
  const availableTimes = interview.available_time_options || [];

  if (mode === "student") {
    card.innerHTML = `
      <h4>${interview.title}</h4>
      <p>Date: ${formatDateDisplay(interview.date)}</p>
      <p>Available times: ${availableTimes.length ? availableTimes.join(", ") : "No slots available"}</p>
    `;

    if (availableTimes.length) {
      const select = document.createElement("select");
      select.className = "interview-time-select";
      availableTimes.forEach((time) => {
        const option = document.createElement("option");
        option.value = time;
        option.textContent = time;
        select.appendChild(option);
      });

      const button = document.createElement("button");
      button.className = "btn";
      button.textContent = interview.booked_by_me ? "Booked" : "Book Interview";
      button.disabled = Boolean(interview.booked_by_me);

      if (!interview.booked_by_me) {
        button.addEventListener("click", async () => {
          const result = await postJson(`/api/interviews/${interview.id}/book`, {
            time_option: select.value,
          });

          if (!result.ok) {
            alert(result.message || "Could not book interview.");
            return;
          }

          await initStudentDashboard();
        });
      }

      card.appendChild(select);
      card.appendChild(button);
    } else {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = interview.booked_by_me ? "You already booked this interview." : "No times left for booking.";
      card.appendChild(note);
    }

    return card;
  }

  const bookings = Object.entries(interview.bookings || {});
  card.innerHTML = `
    <h4>${interview.title}</h4>
    <p>Date: ${formatDateDisplay(interview.date)}</p>
    <p>Time options: ${(interview.time_options || []).join(", ") || "No time options"}</p>
    <p>Booked slots: ${bookedCount}</p>
  `;

  const bookingDetails = interview.booking_details || [];
  if (bookingDetails.length) {
    const list = document.createElement("div");
    list.className = "stack";
    bookingDetails.forEach((booking) => {
      const item = document.createElement("p");
      item.textContent = `${booking.student_name}: ${booking.time}`;
      list.appendChild(item);
    });
    card.appendChild(list);
  }

  return card;
}

function buildTimeOptionFields(containerId, defaultCount = 3) {
  const container = byId(containerId);
  container.innerHTML = "";

  for (let i = 1; i <= defaultCount; i += 1) {
    appendTimeOptionInput(containerId);
  }
}

function appendTimeOptionInput(containerId) {
  const container = byId(containerId);
  const input = document.createElement("input");
  input.type = "time";
  input.required = true;
  container.appendChild(input);
}

function renderEventCard(event, mode = "student") {
  const card = document.createElement("div");
  card.className = "exam-item";

  card.innerHTML = `
    <h4>${event.name}</h4>
    <p>${event.description}</p>
    <p><strong>Date:</strong> ${formatDateDisplay(event.date)}</p>
    <p><strong>Time:</strong> ${event.time || "TBA"}</p>
    <p><strong>Created by:</strong> ${event.created_by_name}</p>
  `;

  if (mode === "student") {
    const status = document.createElement("p");
    status.className = "muted";
    status.textContent = `Your decision: ${event.my_decision || "not selected"}`;
    card.appendChild(status);

    const row = document.createElement("div");
    row.className = "row";

    const joinBtn = document.createElement("button");
    joinBtn.className = "btn";
    joinBtn.textContent = "Join";
    joinBtn.disabled = event.my_decision === "join";

    const notJoinBtn = document.createElement("button");
    notJoinBtn.className = "btn btn-secondary";
    notJoinBtn.textContent = "Not Join";
    notJoinBtn.disabled = event.my_decision === "not_join";

    joinBtn.addEventListener("click", async () => {
      const result = await postJson(`/api/events/${event.id}/rsvp`, { decision: "join" });
      if (!result.ok) {
        alert(result.message || "Could not update RSVP.");
        return;
      }
      await initStudentDashboard();
    });

    notJoinBtn.addEventListener("click", async () => {
      const result = await postJson(`/api/events/${event.id}/rsvp`, { decision: "not_join" });
      if (!result.ok) {
        alert(result.message || "Could not update RSVP.");
        return;
      }
      await initStudentDashboard();
    });

    row.appendChild(joinBtn);
    row.appendChild(notJoinBtn);
    card.appendChild(row);
  } else {
    if (event.is_creator) {
      const joined = event.joined_students?.length
        ? event.joined_students.map((item) => item.student_name).join(", ")
        : "No students joined yet";
      const joinedNode = document.createElement("p");
      joinedNode.innerHTML = `<strong>Joined students:</strong> ${joined}`;
      card.appendChild(joinedNode);
    }
  }

  return card;
}

function renderCalendar(interviews, events, targetId, mode = "student") {
  const target = byId(targetId);
  if (!target) return;

  target.innerHTML = "";

  let interviewItems = interviews || [];
  let eventItems = events || [];

  if (mode === "student") {
    interviewItems = interviewItems.filter((interview) => interview.booked_by_me);
  }

  const items = [
    ...interviewItems.map((interview) => ({ kind: "interview", date: interview.date, interview })),
    ...eventItems.map((event) => ({ kind: "event", date: event.date, event })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!items.length) {
    target.innerHTML = '<p class="muted">No calendar events yet.</p>';
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "exam-item";

    if (item.kind === "interview") {
      const interview = item.interview;
      if (mode === "student") {
        card.innerHTML = `
          <h4>[Interview] ${interview.title}</h4>
          <p><strong>Interviewer:</strong> ${interview.created_by_name}</p>
          <p><strong>Date:</strong> ${formatDateDisplay(interview.date)}</p>
          <p><strong>Time:</strong> ${interview.my_booking_time || "Not selected"}</p>
        `;
      } else {
        const bookedSummary = (interview.booking_details || []).length
          ? interview.booking_details.map((booking) => `${booking.student_name} (${booking.time})`).join(" | ")
          : "No student booked yet";

        card.innerHTML = `
          <h4>[Interview] ${interview.title}</h4>
          <p><strong>Interviewer:</strong> ${interview.created_by_name}</p>
          <p><strong>Date:</strong> ${formatDateDisplay(interview.date)}</p>
          <p><strong>Bookings:</strong> ${bookedSummary}</p>
        `;
      }
    } else {
      const event = item.event;
      if (mode === "student") {
        card.innerHTML = `
          <h4>[Event] ${event.name}</h4>
          <p><strong>Organizer:</strong> ${event.created_by_name}</p>
          <p><strong>Date:</strong> ${formatDateDisplay(event.date)}</p>
          <p><strong>Time:</strong> ${event.time || "TBA"}</p>
          <p><strong>Your RSVP:</strong> ${event.my_decision || "not selected"}</p>
        `;
      } else {
        const joinedText = event.joined_students?.length
          ? event.joined_students.map((student) => student.student_name).join(", ")
          : "No students joined yet";
        card.innerHTML = `
          <h4>[Event] ${event.name}</h4>
          <p><strong>Organizer:</strong> ${event.created_by_name}</p>
          <p><strong>Date:</strong> ${formatDateDisplay(event.date)}</p>
          <p><strong>Time:</strong> ${event.time || "TBA"}</p>
          <p><strong>Joined students:</strong> ${joinedText}</p>
        `;
      }
    }

    target.appendChild(card);
  });
}

async function initLogin() {
  const form = byId("login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;

    const result = await postJson("/login", { email, password });
    if (!result.ok) {
      byId("login-error").textContent = result.message || "Login failed.";
      return;
    }

    window.location.href = result.redirect;
  });
}

async function initStudentDashboard() {
  const examList = byId("exam-list");
  const analysisList = byId("analysis-list");
  const studentInterviewList = byId("student-interview-list");
  const studentEventList = byId("student-event-list");
  if (!examList) return;

  const examsRes = await fetch("/api/student/exams");
  const examsData = await examsRes.json();
  if (!examsData.ok) return;

  examList.innerHTML = "";
  examsData.exams.forEach((exam) => {
    const card = document.createElement("div");
    card.className = "exam-item";
    const buttonLabel = exam.attempted ? "Completed" : "Start Exam";
    const buttonState = exam.attempted ? "disabled aria-disabled=\"true\"" : `data-id="${exam.id}"`;
    card.innerHTML = `
      <h4>${exam.name}</h4>
      <p>Topic: ${exam.topic}</p>
      <p>Question count: ${exam.question_count}</p>
      <p>${exam.attempted ? `Score: ${exam.score}/${exam.total}` : "No attempt yet"}</p>
      <button class="btn" ${buttonState}>${buttonLabel}</button>
    `;
    examList.appendChild(card);
  });

  examList.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => openExamForStudent(btn.dataset.id));
  });

  if (analysisList) {
    analysisList.innerHTML = "";

    const attemptedExams = examsData.exams.filter((exam) => exam.attempted);
    if (!attemptedExams.length) {
      analysisList.innerHTML = '<p class="muted">No exam analyses yet.</p>';
    } else {
      attemptedExams.forEach((exam) => {
        const card = document.createElement("div");
        card.className = "exam-item";

        const weakTopics = exam.weak_topics?.length ? exam.weak_topics.join(", ") : "No weak topics identified";
        const plan = exam.learning_plan || "No learning plan available yet";

        card.innerHTML = `
          <h4>${exam.name}</h4>
          <p>Score: ${exam.score}/${exam.total}</p>
          <p><strong>Weak topics:</strong> ${weakTopics}</p>
          <pre class="plan">${plan}</pre>
        `;
        analysisList.appendChild(card);
      });
    }
  }

  let interviewItems = [];
  if (studentInterviewList) {
    const interviewRes = await fetch("/api/interviews");
    const interviewData = await interviewRes.json();
    if (interviewData.ok) {
      interviewItems = interviewData.interviews;
      studentInterviewList.innerHTML = "";
      if (!interviewData.interviews.length) {
        studentInterviewList.innerHTML = '<p class="muted">No interview slots available yet.</p>';
      } else {
        interviewData.interviews.forEach((interview) => {
          studentInterviewList.appendChild(renderInterviewCard(interview, "student"));
        });
      }
    }
  }

  let eventItems = [];
  if (studentEventList) {
    const eventRes = await fetch("/api/events");
    const eventData = await eventRes.json();
    if (eventData.ok) {
      eventItems = eventData.events;
      studentEventList.innerHTML = "";
      if (!eventData.events.length) {
        studentEventList.innerHTML = '<p class="muted">No events available yet.</p>';
      } else {
        eventData.events.forEach((event) => {
          studentEventList.appendChild(renderEventCard(event, "student"));
        });
      }
    }
  }

  renderCalendar(interviewItems, eventItems, "student-calendar-list", "student");
}

async function openExamForStudent(examId) {
  const detailRes = await fetch(`/api/student/exams/${examId}`);
  const detailData = await detailRes.json();
  if (!detailData.ok) {
    alert(detailData.message || "This exam cannot be opened again.");
    return;
  }

  const exam = detailData.exam;
  byId("exam-attempt").classList.remove("hidden");
  byId("exam-result").classList.add("hidden");
  byId("exam-title").textContent = `${exam.name} (${exam.topic})`;

  const form = byId("exam-form");
  form.innerHTML = "";

  exam.questions.forEach((q) => {
    const block = document.createElement("div");
    block.className = "exam-item";

    const optionsHtml = q.options
      .map(
        (opt, idx) =>
          `<label><input type="radio" name="${q.id}" value="${idx}" required /> ${opt}</label>`
      )
      .join("<br />");

    block.innerHTML = `
      <p><strong>${q.text}</strong></p>
      ${optionsHtml}
    `;
    form.appendChild(block);
  });

  const submitBtn = byId("submit-exam");
  submitBtn.onclick = async () => {
    const answers = {};
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      answers[key] = Number(value);
    }

    const submitData = await postJson(`/api/student/exams/${exam.id}/submit`, { answers });
    if (!submitData.ok) return;

    byId("exam-result").classList.remove("hidden");
    byId("score-text").textContent = `Score: ${submitData.score}/${submitData.total}`;
    byId("weak-topics").textContent = `Weak topics: ${(submitData.weak_topics || []).join(", ") || "None identified"}`;
    byId("learning-plan").textContent = submitData.learning_plan;
    byId("result-message").textContent = submitData.congratulations
      ? "Congratulations! You answered every question correctly."
      : "Your personalized analysis is below.";

    await initStudentDashboard();
  };
}

function buildQuestionFields(questionCount) {
  const container = byId("questions-container");
  container.innerHTML = "";

  for (let i = 1; i <= questionCount; i += 1) {
    const block = document.createElement("div");
    block.className = "exam-item";
    block.innerHTML = `
      <h4>Question ${i}</h4>
      <label>Question text</label>
      <input name="q_text_${i}" required />
      <label>Variant A</label>
      <input name="q_${i}_opt_0" required />
      <label>Variant B</label>
      <input name="q_${i}_opt_1" required />
      <label>Variant C</label>
      <input name="q_${i}_opt_2" required />
      <label>Variant D</label>
      <input name="q_${i}_opt_3" required />
      <label>Correct option</label>
      <select name="q_${i}_correct" required>
        <option value="">Select</option>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
        <option value="D">D</option>
      </select>
    `;
    container.appendChild(block);
  }
}

async function initMentorDashboard() {
  const btn = byId("new-exam-btn");
  const interviewBtn = byId("new-interview-btn");
  if (!btn) return;

  const form = byId("new-exam-form");
  const message = byId("mentor-exam-message");

  btn.addEventListener("click", () => {
    form.classList.toggle("hidden");
  });

  byId("generate-questions").addEventListener("click", () => {
    const questionCount = Number(byId("question-count").value);
    buildQuestionFields(questionCount);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = byId("exam-name").value.trim();
    const topic = byId("exam-topic").value.trim();
    const questionCount = Number(byId("question-count").value);
    const questions = [];

    for (let i = 1; i <= questionCount; i += 1) {
      const correctLetter = form.querySelector(`[name="q_${i}_correct"]`).value;
      questions.push({
        text: form.querySelector(`[name="q_text_${i}"]`).value.trim(),
        options: [0, 1, 2, 3].map((idx) => form.querySelector(`[name="q_${i}_opt_${idx}"]`).value.trim()),
        correct_option: optionLetterToIndex(correctLetter),
      });
    }

    const result = await postJson("/api/mentor/exams", { name, topic, questions });
    if (!result.ok) {
      message.textContent = result.message || "An error occurred while creating the exam.";
      return;
    }

    message.textContent = `Exam created successfully: ${result.exam_id}`;
    form.reset();
    byId("questions-container").innerHTML = "";
    loadMentorStudents();
  });

  if (interviewBtn) {
    const interviewForm = byId("new-interview-form");
    const interviewMessage = byId("mentor-interview-message");
    const interviewList = byId("mentor-interview-list");

    interviewBtn.addEventListener("click", () => {
      interviewForm.classList.toggle("hidden");
    });

    byId("generate-time-options").addEventListener("click", () => {
      buildTimeOptionFields("time-options-container", 3);
    });

    byId("add-time-option").addEventListener("click", () => {
      appendTimeOptionInput("time-options-container");
    });

    interviewForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const timeOptions = Array.from(interviewForm.querySelectorAll("#time-options-container input"))
        .map((input) => input.value.trim())
        .filter(Boolean);
      const normalizedDate = normalizeDateInput(byId("interview-date").value);

      if (!normalizedDate) {
        interviewMessage.textContent = "Interview date must be in dd.mm.yyyy format.";
        return;
      }

      const result = await postJson("/api/interviews", {
        title: byId("interview-title").value.trim(),
        date: normalizedDate,
        time_options: timeOptions,
      });

      if (!result.ok) {
        interviewMessage.textContent = result.message || "An error occurred while creating the interview.";
        return;
      }

      interviewMessage.textContent = `Interview created successfully: ${result.interview_id}`;
      interviewForm.reset();
      byId("time-options-container").innerHTML = "";
      await loadMentorInterviews();
    });

    async function loadMentorInterviews() {
      const res = await fetch("/api/interviews");
      const data = await res.json();
      if (!data.ok) return;

      interviewList.innerHTML = "";
      if (!data.interviews.length) {
        interviewList.innerHTML = '<p class="muted">No interviews created yet.</p>';
        return;
      }

      data.interviews.forEach((interview) => {
        interviewList.appendChild(renderInterviewCard(interview, "mentor"));
      });

      const eventRes = await fetch("/api/events");
      const eventData = await eventRes.json();
      renderCalendar(data.interviews, eventData.ok ? eventData.events : [], "mentor-calendar-list", "staff");
    }

    await loadMentorInterviews();
  }

  const mentorEventBtn = byId("new-event-btn");
  if (mentorEventBtn) {
    const mentorEventForm = byId("new-event-form");
    const mentorEventMessage = byId("mentor-event-message");
    const mentorEventList = byId("mentor-event-list");

    mentorEventBtn.addEventListener("click", () => {
      mentorEventForm.classList.toggle("hidden");
    });

    mentorEventForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const normalizedDate = normalizeDateInput(byId("mentor-event-date").value);
      if (!normalizedDate) {
        mentorEventMessage.textContent = "Event date must be in dd.mm.yyyy format.";
        return;
      }

      const result = await postJson("/api/events", {
        name: byId("mentor-event-name").value.trim(),
        description: byId("mentor-event-description").value.trim(),
        date: normalizedDate,
        time: byId("mentor-event-time").value,
      });

      if (!result.ok) {
        mentorEventMessage.textContent = result.message || "An error occurred while creating the event.";
        return;
      }

      mentorEventMessage.textContent = `Event created successfully: ${result.event_id}`;
      mentorEventForm.reset();
      await loadMentorEvents();
    });

    async function loadMentorEvents() {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (!data.ok) return;

      mentorEventList.innerHTML = "";
      if (!data.events.length) {
        mentorEventList.innerHTML = '<p class="muted">No events created yet.</p>';
        return;
      }

      data.events.forEach((event) => {
        mentorEventList.appendChild(renderEventCard(event, "staff"));
      });
    }

    await loadMentorEvents();
  }
}

async function initSsmDashboard() {
  const btn = byId("new-ssm-interview-btn");
  if (!btn) return;

  const form = byId("new-ssm-interview-form");
  const message = byId("ssm-interview-message");
  const list = byId("ssm-interview-list");

  btn.addEventListener("click", () => {
    form.classList.toggle("hidden");
  });

  byId("generate-ssm-time-options").addEventListener("click", () => {
    buildTimeOptionFields("ssm-time-options-container", 3);
  });

  byId("add-ssm-time-option").addEventListener("click", () => {
    appendTimeOptionInput("ssm-time-options-container");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const timeOptions = Array.from(form.querySelectorAll("#ssm-time-options-container input"))
      .map((input) => input.value.trim())
      .filter(Boolean);
    const normalizedDate = normalizeDateInput(byId("ssm-interview-date").value);

    if (!normalizedDate) {
      message.textContent = "Interview date must be in dd.mm.yyyy format.";
      return;
    }

    const result = await postJson("/api/interviews", {
      title: byId("ssm-interview-title").value.trim(),
      date: normalizedDate,
      time_options: timeOptions,
    });

    if (!result.ok) {
      message.textContent = result.message || "An error occurred while creating the interview.";
      return;
    }

    message.textContent = `Interview created successfully: ${result.interview_id}`;
    form.reset();
    byId("ssm-time-options-container").innerHTML = "";
    await loadSsmInterviews();
  });

  async function loadSsmInterviews() {
    const res = await fetch("/api/interviews");
    const data = await res.json();
    if (!data.ok) return;

    list.innerHTML = "";
    if (!data.interviews.length) {
      list.innerHTML = '<p class="muted">No interviews created yet.</p>';
      return;
    }

    data.interviews.forEach((interview) => {
      list.appendChild(renderInterviewCard(interview, "mentor"));
    });

    const eventRes = await fetch("/api/events");
    const eventData = await eventRes.json();
    renderCalendar(data.interviews, eventData.ok ? eventData.events : [], "ssm-calendar-list", "staff");
  }

  await loadSsmInterviews();

  const ssmEventBtn = byId("new-ssm-event-btn");
  if (ssmEventBtn) {
    const ssmEventForm = byId("new-ssm-event-form");
    const ssmEventMessage = byId("ssm-event-message");
    const ssmEventList = byId("ssm-event-list");

    ssmEventBtn.addEventListener("click", () => {
      ssmEventForm.classList.toggle("hidden");
    });

    ssmEventForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const normalizedDate = normalizeDateInput(byId("ssm-event-date").value);
      if (!normalizedDate) {
        ssmEventMessage.textContent = "Event date must be in dd.mm.yyyy format.";
        return;
      }

      const result = await postJson("/api/events", {
        name: byId("ssm-event-name").value.trim(),
        description: byId("ssm-event-description").value.trim(),
        date: normalizedDate,
        time: byId("ssm-event-time").value,
      });

      if (!result.ok) {
        ssmEventMessage.textContent = result.message || "An error occurred while creating the event.";
        return;
      }

      ssmEventMessage.textContent = `Event created successfully: ${result.event_id}`;
      ssmEventForm.reset();
      await loadSsmEvents();
    });

    async function loadSsmEvents() {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (!data.ok) return;

      ssmEventList.innerHTML = "";
      if (!data.events.length) {
        ssmEventList.innerHTML = '<p class="muted">No events created yet.</p>';
        return;
      }

      data.events.forEach((event) => {
        ssmEventList.appendChild(renderEventCard(event, "staff"));
      });
    }

    await loadSsmEvents();
  }
}

async function loadMentorStudents() {
  const target = byId("mentor-students");
  if (!target) return;

  const res = await fetch("/api/mentor/students");
  const data = await res.json();
  if (!data.ok) return;

  target.innerHTML = "";

  data.students.forEach((s) => {
    const scoresText = s.exam_scores.length
      ? s.exam_scores.map((x) => `${x.exam_name}: ${x.score}/${x.total}`).join(" | ")
      : "No exam scores yet";

    const latest = s.latest_analysis;
    const weakTopicsText = latest?.weak_topics?.length
      ? latest.weak_topics.join(", ")
      : "No weak topics identified";
    const planText = latest?.learning_plan || "No learning plan available yet";
    const examRef = latest?.exam_name ? `Latest analysis (${latest.exam_name})` : "Latest analysis";

    const card = document.createElement("div");
    card.className = "exam-item";
    card.innerHTML = `
      <strong>${s.name}</strong>
      <p>${s.email}</p>
      <p>${scoresText}</p>
      <p><strong>${examRef}</strong></p>
      <p><strong>Weak topics:</strong> ${weakTopicsText}</p>
      <pre class="plan">${planText}</pre>
    `;
    target.appendChild(card);
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  await initLogin();
  await initStudentDashboard();
  await initMentorDashboard();
  await initSsmDashboard();
});
