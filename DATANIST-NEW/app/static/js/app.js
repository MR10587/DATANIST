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

function initSectionSwitchers() {
  const switchers = document.querySelectorAll("[data-section-switcher]");
  if (!switchers.length) return;

  switchers.forEach((switcher) => {
    const sectionGroup = switcher.dataset.sectionGroup;
    if (!sectionGroup) return;

    const sections = Array.from(document.querySelectorAll(`[data-section-group="${sectionGroup}"]`));
    if (!sections.length) return;

    const visibleIds = new Set(sections.map((section) => section.dataset.sectionId).filter(Boolean));
    if (!visibleIds.size) return;

    if (!visibleIds.has(switcher.value)) {
      switcher.value = sections[0].dataset.sectionId;
    }

    const applySelection = () => {
      sections.forEach((section) => {
        section.classList.toggle("hidden", section.dataset.sectionId !== switcher.value);
      });
    };

    applySelection();
    switcher.addEventListener("change", applySelection);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

const calendarState = {};

function getCalendarPrefix(targetId) {
  return String(targetId || "").replace(/-calendar-list$/, "");
}

function daysUntilDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;

  const [year, month, day] = normalized.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target - today) / 86400000);
}

function isUpcomingDate(value, maxDays = 7) {
  const diff = daysUntilDate(value);
  return diff !== null && diff >= 0 && diff <= maxDays;
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "Unknown month";

  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function renderMetricCards(targetId, metrics) {
  const target = byId(targetId);
  if (!target) return;

  target.innerHTML = "";

  if (!metrics || !metrics.length) {
    target.innerHTML = '<p class="muted">No insights available yet.</p>';
    return;
  }

  const grid = document.createElement("div");
  grid.className = "insights-grid";

  metrics.forEach((metric) => {
    const card = document.createElement("div");
    card.className = "insight-card";

    const value = document.createElement("h4");
    value.textContent = metric.value;

    const label = document.createElement("p");
    label.className = "muted";
    label.textContent = metric.label;

    card.appendChild(label);
    card.appendChild(value);

    if (metric.detail) {
      const detail = document.createElement("p");
      detail.textContent = metric.detail;
      card.appendChild(detail);
    }

    grid.appendChild(card);
  });

  target.appendChild(grid);
}

function renderNotificationList(targetId, notifications) {
  const target = byId(targetId);
  if (!target) return;

  target.innerHTML = "";

  if (!notifications || !notifications.length) {
    target.innerHTML = '<p class="muted">No notifications right now.</p>';
    return;
  }

  notifications.forEach((notification) => {
    const item = document.createElement("div");
    item.className = "notification-item";

    const title = document.createElement("strong");
    title.textContent = notification.title;

    const message = document.createElement("p");
    message.textContent = notification.message;

    item.appendChild(title);
    item.appendChild(message);
    target.appendChild(item);
  });
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
      <p><strong>Fill rate:</strong> ${interview.booking_rate || 0}%</p>
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
    <p><strong>Fill rate:</strong> ${interview.booking_rate || 0}%</p>
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
    <p><strong>RSVP response rate:</strong> ${event.response_rate || 0}%</p>
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

  const prefix = getCalendarPrefix(targetId);
  const filterSelect = byId(`${prefix}-calendar-month-filter`);
  const summaryNode = byId(`${prefix}-calendar-summary`);

  calendarState[targetId] = {
    interviews: interviews || [],
    events: events || [],
    mode,
  };

  if (filterSelect && !filterSelect.dataset.bound) {
    filterSelect.dataset.bound = "true";
    filterSelect.addEventListener("change", () => {
      const current = calendarState[targetId] || { interviews: [], events: [], mode };
      renderCalendar(current.interviews, current.events, targetId, current.mode);
    });
  }

  let interviewItems = (interviews || []).slice();
  let eventItems = (events || []).slice();

  if (mode === "student") {
    interviewItems = interviewItems.filter((interview) => interview.booked_by_me);
    eventItems = eventItems.filter((event) => event.my_decision === "join");
  }

  const items = [
    ...interviewItems.map((interview) => ({ kind: "interview", date: interview.date, interview })),
    ...eventItems.map((event) => ({ kind: "event", date: event.date, event })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const monthKeys = [...new Set(items.map((item) => String(item.date || "").slice(0, 7)).filter(Boolean))].sort();
  const previousValue = filterSelect?.value || "all";

  if (filterSelect) {
    filterSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All months";
    filterSelect.appendChild(allOption);

    monthKeys.forEach((monthKey) => {
      const option = document.createElement("option");
      option.value = monthKey;
      option.textContent = formatMonthLabel(monthKey);
      filterSelect.appendChild(option);
    });

    filterSelect.value = monthKeys.includes(previousValue) || previousValue === "all" ? previousValue : (monthKeys[0] || "all");
  }

  const selectedMonth = filterSelect ? filterSelect.value : "all";
  const visibleItems = selectedMonth === "all"
    ? items
    : items.filter((item) => String(item.date || "").slice(0, 7) === selectedMonth);

  if (summaryNode) {
    const monthCount = selectedMonth === "all" ? monthKeys.length : 1;
    summaryNode.textContent = visibleItems.length
      ? `${visibleItems.length} item(s) across ${monthCount} month(s).`
      : "No calendar events yet.";
  }

  target.innerHTML = "";

  if (!visibleItems.length) {
    target.innerHTML = '<p class="muted">No calendar events yet.</p>';
    return;
  }

  const groupedByMonth = new Map();
  visibleItems.forEach((item) => {
    const monthKey = String(item.date || "").slice(0, 7) || "unknown";
    if (!groupedByMonth.has(monthKey)) {
      groupedByMonth.set(monthKey, []);
    }
    groupedByMonth.get(monthKey).push(item);
  });

  [...groupedByMonth.entries()].forEach(([monthKey, monthItems]) => {
    const group = document.createElement("section");
    group.className = "calendar-group";

    const heading = document.createElement("h4");
    heading.textContent = formatMonthLabel(monthKey);
    group.appendChild(heading);

    const stack = document.createElement("div");
    stack.className = "stack";

    monthItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "exam-item";

      if (item.kind === "interview") {
        const interview = item.interview;
        const bookedSummary = (interview.booking_details || []).length
          ? interview.booking_details.map((booking) => `${booking.student_name} (${booking.time})`).join(" | ")
          : "No student booked yet";

        card.innerHTML = mode === "student"
          ? `
            <h4>[Interview] ${interview.title}</h4>
            <p><strong>Interviewer:</strong> ${interview.created_by_name}</p>
            <p><strong>Date:</strong> ${formatDateDisplay(interview.date)}</p>
            <p><strong>Time:</strong> ${interview.my_booking_time || "Not selected"}</p>
          `
          : `
            <h4>[Interview] ${interview.title}</h4>
            <p><strong>Interviewer:</strong> ${interview.created_by_name}</p>
            <p><strong>Date:</strong> ${formatDateDisplay(interview.date)}</p>
            <p><strong>Bookings:</strong> ${bookedSummary}</p>
            <p><strong>Fill rate:</strong> ${interview.booking_rate || 0}%</p>
          `;
      } else {
        const event = item.event;
        const joinedText = event.joined_students?.length
          ? event.joined_students.map((student) => student.student_name).join(", ")
          : "No students joined yet";

        card.innerHTML = mode === "student"
          ? `
            <h4>[Event] ${event.name}</h4>
            <p><strong>Organizer:</strong> ${event.created_by_name}</p>
            <p><strong>Date:</strong> ${formatDateDisplay(event.date)}</p>
            <p><strong>Time:</strong> ${event.time || "TBA"}</p>
            <p><strong>Your RSVP:</strong> ${event.my_decision || "not selected"}</p>
          `
          : `
            <h4>[Event] ${event.name}</h4>
            <p><strong>Organizer:</strong> ${event.created_by_name}</p>
            <p><strong>Date:</strong> ${formatDateDisplay(event.date)}</p>
            <p><strong>Time:</strong> ${event.time || "TBA"}</p>
            <p><strong>Joined students:</strong> ${joinedText}</p>
            <p><strong>RSVP response rate:</strong> ${event.response_rate || 0}%</p>
          `;
      }

      stack.appendChild(card);
    });

    group.appendChild(stack);
    target.appendChild(group);
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
  const studentNotificationList = byId("student-notification-list");
  const studentAnalyticsList = byId("student-analytics-list");
  const profileForm = byId("student-profile-form");
  if (!examList) return;

  let profileSnapshot = null;
  if (profileForm) {
    const profileRes = await fetch("/api/student/profile");
    const profileData = await profileRes.json();
    if (profileData.ok) {
      const profile = profileData.profile || {};
      profileSnapshot = profile;
      byId("student-motivation-letter").value = profile.motivation_letter || "";
      byId("student-cv-current").innerHTML = profile.cv_url
        ? `Current CV: <a href="${profile.cv_url}" target="_blank">${escapeHtml(profile.cv_filename)}</a>`
        : "No CV uploaded yet.";
      const profileMeta = byId("student-profile-meta");
      if (profileMeta) {
        profileMeta.textContent = `Profile completeness: ${profile.profile_completeness || 0}% (${profile.profile_status || "Needs attention"})`;
      }
      const profileNotes = byId("student-profile-notes");
      if (profileNotes) {
        profileNotes.innerHTML = (profile.profile_notes || []).length
          ? profile.profile_notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")
          : "<li>No profile notes yet.</li>";
      }
      const profileKeywords = byId("student-cv-keywords");
      if (profileKeywords) {
        profileKeywords.textContent = (profile.cv_keywords || []).length
          ? `CV keywords: ${profile.cv_keywords.join(", ")}`
          : "CV keywords will appear after a parsable upload.";
      }
      const profileExcerpt = byId("student-cv-excerpt");
      if (profileExcerpt) {
        profileExcerpt.textContent = profile.cv_excerpt ? `CV excerpt: ${profile.cv_excerpt}` : "CV excerpt is not available yet.";
      }
    }

    profileForm.onsubmit = async (e) => {
      e.preventDefault();

      const formData = new FormData();
      formData.append("motivation_letter", byId("student-motivation-letter").value || "");
      const cvInput = byId("student-cv-file");
      if (cvInput?.files?.[0]) {
        formData.append("cv_file", cvInput.files[0]);
      }

      const response = await fetch("/api/student/profile", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      const messageNode = byId("student-profile-message");
      if (!result.ok) {
        messageNode.textContent = result.message || "Could not save profile.";
        return;
      }

      messageNode.textContent = "Profile saved successfully.";
      const profile = result.profile || {};
      byId("student-cv-current").innerHTML = profile.cv_url
        ? `Current CV: <a href="${profile.cv_url}" target="_blank">${escapeHtml(profile.cv_filename)}</a>`
        : "No CV uploaded yet.";
      if (cvInput) cvInput.value = "";
    };
  }

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
      window.__studentInterviews = interviewItems;
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

  const attemptedExams = examsData.exams.filter((exam) => exam.attempted);
  const averageScore = attemptedExams.length
    ? Math.round(
        attemptedExams.reduce((sum, exam) => sum + ((exam.score || 0) / Math.max(exam.total || 1, 1)) * 100, 0) /
          attemptedExams.length
      )
    : 0;

  const weakTopicCounts = new Map();
  attemptedExams.forEach((exam) => {
    (exam.weak_topics || []).forEach((topic) => {
      weakTopicCounts.set(topic, (weakTopicCounts.get(topic) || 0) + 1);
    });
  });
  const weakestTopic = [...weakTopicCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "No weak topic identified";

  if (studentEventList) {
    const eventRes = await fetch("/api/events");
    const eventData = await eventRes.json();
    if (eventData.ok) {
      eventItems = eventData.events;
      window.__studentEvents = eventItems;
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

  const notifications = [];
  if (profileSnapshot) {
    if ((profileSnapshot.profile_completeness || 0) < 100) {
      notifications.push({
        title: "Profile reminder",
        message: `${profileSnapshot.profile_completeness || 0}% complete. ${((profileSnapshot.profile_notes || [])[0]) || "Finish your profile to improve visibility."}`,
      });
    }
  }

  if (!attemptedExams.length) {
    notifications.push({
      title: "Exam reminder",
      message: "You have not submitted any exams yet.",
    });
  }

  const bookedInterviews = interviewItems.filter((interview) => interview.booked_by_me);
  bookedInterviews.filter((interview) => isUpcomingDate(interview.date, 7)).forEach((interview) => {
    notifications.push({
      title: "Upcoming interview",
      message: `${interview.title} is scheduled for ${formatDateDisplay(interview.date)} at ${interview.my_booking_time || "TBA"}.`,
    });
  });

  const joinedEvents = eventItems.filter((event) => event.my_decision === "join");
  joinedEvents.filter((event) => isUpcomingDate(event.date, 7)).forEach((event) => {
    notifications.push({
      title: "Upcoming event",
      message: `${event.name} happens on ${formatDateDisplay(event.date)} at ${event.time || "TBA"}.`,
    });
  });

  renderNotificationList("student-notification-list", notifications);

  renderMetricCards("student-analytics-list", [
    {
      label: "Average score",
      value: attemptedExams.length ? `${averageScore}%` : "N/A",
      detail: attemptedExams.length ? `${attemptedExams.length} completed exam(s)` : "No submitted exams yet",
    },
    {
      label: "Strongest focus",
      value: attemptedExams.length ? weakestTopic : "N/A",
      detail: "Most repeated weak topic across your analyses",
    },
    {
      label: "Profile completeness",
      value: `${profileSnapshot?.profile_completeness || 0}%`,
      detail: profileSnapshot?.profile_status || "Needs attention",
    },
    {
      label: "Engagement",
      value: `${bookedInterviews.length + joinedEvents.length}`,
      detail: `${bookedInterviews.length} interview booking(s), ${joinedEvents.length} event join(s)`,
    },
  ]);

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

  let mentorStudents = await loadStaffStudents("mentor-students");

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
    mentorStudents = await loadStaffStudents("mentor-students");
    await renderStaffInsights("mentor", mentorStudents || []);
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
      await renderStaffInsights("mentor", mentorStudents || []);
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

      await renderStaffInsights("mentor", mentorStudents || []);
    }

    await loadMentorEvents();
  }
}

async function initSsmDashboard() {
  const btn = byId("new-ssm-interview-btn");
  if (!btn) return;

  let ssmStudents = await loadStaffStudents("ssm-students");

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
      await renderStaffInsights("ssm", ssmStudents || []);
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

      await renderStaffInsights("ssm", ssmStudents || []);
    }

    await loadSsmEvents();
  }
}

async function loadStaffStudents(targetId = "mentor-students") {
  const target = byId(targetId);
  if (!target) return null;

  const res = await fetch("/api/mentor/students");
  const data = await res.json();
  if (!data.ok) return null;

  target.innerHTML = "";

  data.students.forEach((s) => {
    const scoresText = s.exam_scores.length
      ? s.exam_scores.map((x) => `${x.exam_name}: ${x.score}/${x.total}`).join(" | ")
      : "No exam scores yet";

    const averageScore = s.exam_scores.length
      ? Math.round(
          s.exam_scores.reduce((sum, item) => sum + ((item.score || 0) / Math.max(item.total || 1, 1)) * 100, 0) /
            s.exam_scores.length
        )
      : 0;

    const latest = s.latest_analysis;
    const weakTopicsText = latest?.weak_topics?.length
      ? latest.weak_topics.join(", ")
      : "No weak topics identified";
    const planText = latest?.learning_plan || "No learning plan available yet";
    const examRef = latest?.exam_name ? `Latest analysis (${latest.exam_name})` : "Latest analysis";
    const cvUrl = s.profile?.cv_url;
    const cvName = s.profile?.cv_filename || "No CV uploaded";
    const motivationLetter = s.profile?.motivation_letter || "No motivation letter yet.";
    const profileCompleteness = s.profile?.profile_completeness || 0;
    const profileStatus = s.profile?.profile_status || "Needs attention";
    const profileNotes = s.profile?.profile_notes || [];
    const profileKeywords = s.profile?.cv_keywords || [];

    const summary = document.createElement("button");
    summary.className = "btn btn-secondary";
    summary.type = "button";
    summary.textContent = `${s.name} - ${profileCompleteness}% profile`;

    const detail = document.createElement("div");
    detail.className = "exam-item hidden";
    detail.innerHTML = `
      <p><strong>Email:</strong> ${s.email}</p>
      <p><strong>Profile completeness:</strong> ${profileCompleteness}% (${escapeHtml(profileStatus)})</p>
      <p>${scoresText}</p>
      <p><strong>Average exam score:</strong> ${averageScore}%</p>
      <p><strong>${examRef}</strong></p>
      <p><strong>Weak topics:</strong> ${weakTopicsText}</p>
      <pre class="plan">${planText}</pre>
      <p><strong>CV:</strong> ${cvUrl ? `<a href="${cvUrl}" target="_blank">${escapeHtml(cvName)}</a>` : escapeHtml(cvName)}</p>
      <p><strong>CV keywords:</strong> ${profileKeywords.length ? escapeHtml(profileKeywords.join(", ")) : "No keywords extracted yet"}</p>
      <p><strong>Motivation Letter:</strong></p>
      <pre class="plan">${escapeHtml(motivationLetter)}</pre>
      <p><strong>Profile notes:</strong></p>
      <ul>${profileNotes.length ? profileNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("") : "<li>No profile notes.</li>"}</ul>
    `;

    summary.addEventListener("click", () => {
      detail.classList.toggle("hidden");
    });

    const card = document.createElement("div");
    card.className = "exam-item";
    card.appendChild(summary);
    card.appendChild(detail);
    target.appendChild(card);
  });

  return data.students;
}

async function renderStaffInsights(prefix, students) {
  const [interviewRes, eventRes] = await Promise.all([fetch("/api/interviews"), fetch("/api/events")]);
  const interviewData = await interviewRes.json();
  const eventData = await eventRes.json();

  const interviews = interviewData.ok ? interviewData.interviews : [];
  const events = eventData.ok ? eventData.events : [];
  const notifications = [];

  interviews.filter((interview) => isUpcomingDate(interview.date, 7)).forEach((interview) => {
    notifications.push({
      title: "Interview reminder",
      message: `${interview.title} is scheduled for ${formatDateDisplay(interview.date)} with ${interview.booking_count || 0}/${interview.capacity || 0} booked slots.`,
    });
  });

  events.filter((event) => event.is_creator && isUpcomingDate(event.date, 7)).forEach((event) => {
    notifications.push({
      title: "Event reminder",
      message: `${event.name} happens on ${formatDateDisplay(event.date)} at ${event.time || "TBA"}.`,
    });
  });

  const studentsNeedingReview = (students || []).filter((student) => (student.profile?.profile_completeness || 0) < 60);
  if (studentsNeedingReview.length) {
    notifications.push({
      title: "Review queue",
      message: `${studentsNeedingReview.length} student profile(s) need attention.`,
    });
  }

  const allStudentScores = [];
  const weakTopicCounts = new Map();
  let profileCompletenessTotal = 0;
  let profileCount = 0;

  (students || []).forEach((student) => {
    profileCompletenessTotal += student.profile?.profile_completeness || 0;
    profileCount += 1;
    student.exam_scores.forEach((item) => {
      allStudentScores.push((item.score || 0) / Math.max(item.total || 1, 1));
      (item.weak_topics || []).forEach((topic) => {
        weakTopicCounts.set(topic, (weakTopicCounts.get(topic) || 0) + 1);
      });
    });
  });

  const averageScore = allStudentScores.length
    ? Math.round(allStudentScores.reduce((sum, score) => sum + score, 0) / allStudentScores.length * 100)
    : 0;

  const passRate = allStudentScores.length
    ? Math.round((allStudentScores.filter((score) => score >= 0.7).length / allStudentScores.length) * 100)
    : 0;

  const averageProfileCompleteness = profileCount
    ? Math.round(profileCompletenessTotal / profileCount)
    : 0;

  const topWeakTopics = [...weakTopicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic)
    .join(", ") || "No weak topics yet";

  const interviewFillRate = interviews.length
    ? Math.round(interviews.reduce((sum, interview) => sum + (interview.booking_rate || 0), 0) / interviews.length)
    : 0;

  const eventResponseRate = events.filter((event) => event.is_creator).length
    ? Math.round(
        events.filter((event) => event.is_creator).reduce((sum, event) => sum + (event.response_rate || 0), 0) /
          events.filter((event) => event.is_creator).length
      )
    : 0;

  renderNotificationList(`${prefix}-notification-list`, notifications);
  renderMetricCards(`${prefix}-analytics-list`, [
    {
      label: "Average exam score",
      value: `${averageScore}%`,
      detail: "Across all submitted exams",
    },
    {
      label: "Pass rate",
      value: `${passRate}%`,
      detail: "Share of submissions at or above 70%",
    },
    {
      label: "Profile completeness",
      value: `${averageProfileCompleteness}%`,
      detail: "Average across the student cohort",
    },
    {
      label: "Interview fill rate",
      value: `${interviewFillRate}%`,
      detail: "Average booking rate of created interviews",
    },
    {
      label: "Event response rate",
      value: `${eventResponseRate}%`,
      detail: "Average RSVP response rate for created events",
    },
    {
      label: "Top weak topics",
      value: topWeakTopics,
      detail: "Most frequent review signals from student exams",
    },
  ]);
}

window.addEventListener("DOMContentLoaded", async () => {
  initSectionSwitchers();
  await initLogin();
  await initStudentDashboard();
  await initMentorDashboard();
  await initSsmDashboard();
  await loadStaffStudents("mentor-students");
  await loadStaffStudents("ssm-students");
});
