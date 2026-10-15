
"use strict";

const STORAGE_KEY = "activityRecords_v1";
const ROUTINE_STORAGE_KEY = "routineActivities_v1";
const DAILY_MEMO_STORAGE_KEY = "dailyMemos_v1";
const PLAN_STORAGE_KEY = "activityPlans_v1";

let records = loadJson(STORAGE_KEY, []);
let routineActivities = loadJson(ROUTINE_STORAGE_KEY, []);
let dailyMemos = loadJson(DAILY_MEMO_STORAGE_KEY, {});
let plans = loadJson(PLAN_STORAGE_KEY, []);

let selectedMood = null;
let editingId = null;
let editingPlanId = null;
let completingPlan = null;
let moodChart = null;
let routineSettingsOpen = false;

const dateInput = document.getElementById("recordDate");
const timeInput = document.getElementById("recordTime");
const activityInput = document.getElementById("activity");
const formMessage = document.getElementById("formMessage");
const saveButton = document.getElementById("saveButton");
const cancelEditButton = document.getElementById("cancelEditButton");
const timelineDateInput = document.getElementById("timelineDisplayDate");
const graphDateInput = document.getElementById("graphDisplayDate");
const dailyMemoInput = document.getElementById("dailyMemo");
const dailyMemoMessage = document.getElementById("dailyMemoMessage");
const saveDailyMemoButton = document.getElementById("saveDailyMemoButton");
const searchMoodInput = document.getElementById("searchMood");

const MOOD_SETTINGS_KEY = "moodSettings_v2";

const LEGACY_MOOD_SETTINGS = {
  min: -3,
  max: 3,
  step: 1,
  method: "buttons"
};

let moodSettings = normalizeMoodSettings(
  loadJson(MOOD_SETTINGS_KEY, LEGACY_MOOD_SETTINGS)
);

let editingMoodSettings = null;

function normalizeMoodSettings(s) {
  const x = s || {};
  return {
    min: Number.isFinite(Number(x.min)) ? Number(x.min) : -3,
    max: Number.isFinite(Number(x.max)) ? Number(x.max) : 3,
    step: Number(x.step) > 0 ? Number(x.step) : 1,
    method: ["buttons", "keyboard", "select", "slider"]
      .includes(x.method) ? x.method : "buttons"
  };
}

function settingsForRecord(record) {
  return record.moodSettings
    ? normalizeMoodSettings(record.moodSettings)
    : LEGACY_MOOD_SETTINGS;
}

function normalizedMood(record) {
  const s = settingsForRecord(record);
  return s.max === s.min
    ? 50
    : (Number(record.mood) - s.min) * 100 / (s.max - s.min);
}

function validMood(value, s) {
  if (
    value === null ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) return false;

  const n = Number(value);

  if (n < s.min - 1e-8 || n > s.max + 1e-8) {
    return false;
  }

  return Math.abs(
    (n - s.min) / s.step -
    Math.round((n - s.min) / s.step)
  ) < 1e-6;
}

function moodValues(s) {
  const count =
    Math.floor((s.max - s.min) / s.step + 1e-8) + 1;

  return Array.from(
    { length: Math.min(count, 1000) },
    (_, i) => Number((s.min + i * s.step).toPrecision(12))
  );
}

function renderMoodInput() {
  const root = document.getElementById("moodButtons");
  root.replaceChildren();

  const s = editingMoodSettings || moodSettings;
  const values = moodValues(s);

  root.className = "mood-buttons";

  if (s.method === "buttons" && values.length <= 30) {
    root.style.gridTemplateColumns =
      `repeat(${Math.min(7, values.length)}, minmax(0, 1fr))`;

    values.forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.mood = String(v);
      b.textContent = formatMood(v);
      b.onclick = () => selectMood(v);
      root.append(b);
    });

  } else if (s.method === "slider") {
    root.classList.add("mood-single-input");

    const range = document.createElement("input");
    range.type = "range";
    range.min = s.min;
    range.max = s.min + (values.length - 1) * s.step;
    range.step = s.step;

    range.value = validMood(selectedMood, s)
      ? selectedMood
      : s.min;

    const label = document.createElement("output");
    label.textContent = formatMood(Number(range.value));

    range.oninput = () => {
      selectedMood = Number(range.value);
      label.textContent = formatMood(selectedMood);
    };

    root.append(range, label);

  } else if (
    s.method === "select" ||
    (s.method === "buttons" && values.length > 30)
  ) {
    root.classList.add("mood-single-input");

    const select = document.createElement("select");
    select.append(new Option("選択してください", ""));

    values.forEach(v => {
      select.append(new Option(formatMood(v), String(v)));
    });

    select.value = validMood(selectedMood, s)
      ? String(selectedMood)
      : "";

    select.onchange = () => {
      selectMood(
        select.value === "" ? null : Number(select.value)
      );
    };

    root.append(select);

  } else {
    root.classList.add("mood-single-input");

    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.min = s.min;
    input.max = s.max;
    input.placeholder = `${s.min}〜${s.max}`;

    input.value = selectedMood === null
      ? ""
      : selectedMood;

    input.oninput = () => {
      selectedMood = input.value === ""
        ? null
        : Number(input.value);
    };

    root.append(input);
  }

  document.getElementById("moodGuide").textContent =
    `${s.min}〜${s.max}（間隔 ${s.step}）`;

  document.querySelectorAll("#moodButtons button")
    .forEach(b => {
      const active =
        selectedMood !== null &&
        Number(b.dataset.mood) === selectedMood;

      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", String(active));
    });
}

const routineModal = document.getElementById("routineModal");
const routineList = document.getElementById("routineList");
const routineSettings = document.getElementById("routineSettings");
const routineEditList = document.getElementById("routineEditList");
const newRoutineInput = document.getElementById("newRoutineInput");

const planActivity = document.getElementById("planActivity");
const planDate = document.getElementById("planDate");
const planTime = document.getElementById("planTime");
const planRepeat = document.getElementById("planRepeat");

/* =========================
   記録入力
========================= */

document.getElementById("nowButton")
  .addEventListener("click", setCurrentDateTime);

saveButton.addEventListener("click", saveRecord);
cancelEditButton.addEventListener("click", resetForm);

timeInput.addEventListener("input", () => {
  timeInput.value = timeInput.value
    .replace(/[^0-9:]/g, "")
    .slice(0, 5);
});

timeInput.addEventListener("blur", () => {
  if (!timeInput.value.trim()) return;

  const normalized = normalizeTypedTime(timeInput.value);
  if (normalized) timeInput.value = normalized;
});

function selectMood(mood) {
  selectedMood = mood;
  renderMoodInput();
}

document.getElementById("openMoodSettings").onclick = () => {
  ["min", "max", "step", "method"].forEach(k => {
    const id = "mood" + k[0].toUpperCase() + k.slice(1);
    document.getElementById(id).value = moodSettings[k];
  });

  document.getElementById("moodSettingsError")
    .textContent = "";

  document.getElementById("moodSettingsPanel")
    .classList.remove("hidden");
};

document.getElementById("cancelMoodSettings").onclick = () => {
  document.getElementById("moodSettingsPanel")
    .classList.add("hidden");
};

document.getElementById("saveMoodSettings").onclick = () => {
  const s = {
    min: Number(document.getElementById("moodMin").value),
    max: Number(document.getElementById("moodMax").value),
    step: Number(document.getElementById("moodStep").value),
    method: document.getElementById("moodMethod").value
  };

  const error = document.getElementById("moodSettingsError");

  const fieldsFilled = ["moodMin", "moodMax", "moodStep"]
    .every(id => document.getElementById(id).value.trim() !== "");

  const steps = (s.max - s.min) / s.step;

  if (
    !fieldsFilled ||
    ![s.min, s.max, s.step].every(Number.isFinite) ||
    s.max <= s.min ||
    s.step <= 0 ||
    steps > 999 ||
    Math.abs(steps - Math.round(steps)) > 1e-6
  ) {
    error.textContent =
      "最大値・最小値・間隔を確認してください。" +
      "（最大1000段階、最大値は間隔で到達する値）";
    return;
  }

  if (!saveJson(MOOD_SETTINGS_KEY, s)) {
    error.textContent = "設定を保存できませんでした。";
    return;
  }

  moodSettings = s;
  editingMoodSettings = null;
  selectedMood = null;

  renderMoodInput();

  document.getElementById("moodSettingsPanel")
    .classList.add("hidden");
};

function saveRecord() {
  const date = dateInput.value;
  const time = normalizeTypedTime(timeInput.value);
  const activity = activityInput.value.trim();

  if (!date) {
    showFormMessage("日付を入力してください。");
    return;
  }

  if (!time) {
    showFormMessage("時刻を入力してください。");
    return;
  }

  if (!activity) {
    showFormMessage("活動内容を入力してください。");
    return;
  }

  if (!validMood(
    selectedMood,
    editingMoodSettings || moodSettings
  )) {
    showFormMessage("気分を選択してください。");
    return;
  }

  const wasEditing = editingId !== null;

  const existingRecord = wasEditing
    ? records.find(item => item.id === editingId)
    : null;

  const record = {
    id: editingId || createRecordId(),
    ...(existingRecord?.planId
      ? { planId: existingRecord.planId }
      : {}),
    date,
    time,
    activity,
    mood: selectedMood,
    moodSettings: {
      ...(editingMoodSettings || moodSettings)
    }
  };

  if (wasEditing) {
    records = records.map(item =>
      item.id === editingId ? record : item
    );
  } else {
    records.push(record);
  }

  
  // 保存前のデータを保持する
  const previousRecords = wasEditing
    ? records.map(item =>
        item.id === record.id
          ? existingRecord
          : item
      )
    : records.filter(item => item !== record);

  // 保存を実行
  const saved = saveJson(STORAGE_KEY, records);

  // 保存に失敗した場合
  if (!saved) {
    records = previousRecords;

    showFormMessage(
      "記録を保存できませんでした。入力内容は残っています。"
    );

    return;
  }

  // 保存に成功した場合のみ画面を更新
  renderTimeline();
  drawGraph();
  resetForm();


  showFormMessage(
    wasEditing ? "記録を更新しました。" : "記録しました。",
    true
  );
}

function editRecord(id) {
  const record = records.find(item => item.id === id);
  if (!record) return;

  editingId = id;
  dateInput.value = record.date;
  timeInput.value = record.time;
  activityInput.value = record.activity;

  editingMoodSettings = {
    ...settingsForRecord(record)
  };

  selectMood(Number(record.mood));

  saveButton.textContent = "更新する";
  cancelEditButton.classList.remove("hidden");

  showFormMessage("");
  showPage("inputPage");
  activityInput.focus();
}

function deleteRecord(id) {
  const record = records.find(item => item.id === id);
  if (!record) return;

  if (!window.confirm("この記録を削除しますか？")) {
    return;
  }

  const nextRecords = records.filter(item => item.id !== id);

  const nextPlans = record.planId
    ? plans.map(plan => plan.id === record.planId
      ? {
          ...plan,
          deletedDates: [...new Set([
            ...(Array.isArray(plan.deletedDates)
              ? plan.deletedDates
              : []),
            record.date
          ])]
        }
      : plan)
    : plans;

  if (
    record.planId &&
    !saveJson(PLAN_STORAGE_KEY, nextPlans)
  ) return;

  if (!saveJson(STORAGE_KEY, nextRecords)) {
    if (record.planId) {
      saveJson(PLAN_STORAGE_KEY, plans);
    }
    return;
  }

  records = nextRecords;
  plans = nextPlans;

  renderTimeline();
  renderPlanList();
  drawGraph();
}

document.getElementById("clearAllButton")
  .addEventListener("click", clearAllRecords);

function clearAllRecords() {
  if (records.length === 0) return;

  if (!window.confirm("すべての活動記録を削除しますか？")) {
    return;
  }

  records = [];
  saveJson(STORAGE_KEY, records);
  renderTimeline();
  drawGraph();
}

function resetForm() {
  editingId = null;
  editingMoodSettings = null;
  activityInput.value = "";
  selectMood(null);
  setCurrentDateTime();

  saveButton.textContent = "記録する";
  cancelEditButton.classList.add("hidden");
}

function showFormMessage(text, success = false) {
  formMessage.textContent = text;
  formMessage.classList.toggle("success", success);
}

/* =========================
   時系列
========================= */

timelineDateInput.addEventListener("change", () => {
  document.getElementById("timelineFilterMessage").textContent = "";
  renderTimeline();
  loadDailyMemo(timelineDateInput.value);
});

document.getElementById("timelineResetButton")
  .addEventListener("click", () => {
    timelineDateInput.value = "";
    document.getElementById("timelineFilterMessage").textContent = "";
    renderTimeline();
    loadDailyMemo("");
  });

function getTimelineRecords() {
  const selectedDate = timelineDateInput.value;

  return getSortedRecords().filter(record =>
    !selectedDate || record.date === selectedDate
  );
}

function renderTimeline() {
  const timeline = document.getElementById("timeline");
  const items = getTimelineRecords();
  const pending = pendingPlans(timelineDateInput.value);

  document.getElementById("recordCount").textContent =
    `${items.length + pending.length}件`;

  document.getElementById("clearAllButton")
    .classList.toggle("hidden", records.length === 0);

  if (items.length === 0 && pending.length === 0) {
    timeline.innerHTML = `
      <p class="empty-message">
        この日の記録はありません。
      </p>
    `;
    return;
  }

  const completedHtml = items.map(record => `
    <article class="timeline-item">
      <div class="record-head">
        <time
          class="record-date"
          datetime="${record.date}T${getSortableTime(record.time)}"
        >
          ${formatDate(record.date)}
          ${escapeHtml(record.time)}
        </time>

        <span
          class="mood-badge"
          style="background:${moodColor(
            Number(record.mood),
            settingsForRecord(record)
          )}"
        >
          気分 ${formatMood(Number(record.mood))}
        </span>
      </div>

      <p class="activity-text">
        ${escapeHtml(record.activity)}
      </p>

      <div class="record-actions">
        <button
          type="button"
          onclick="editRecord('${record.id}')"
        >
          編集
        </button>
        <button
          type="button"
          class="delete-button"
          onclick="deleteRecord('${record.id}')"
        >
          削除
        </button>
      </div>
    </article>
  `).join("");

  const pendingHtml = pending.map(({ plan, date }) => `
    <article class="timeline-item pending-plan">
      <div class="record-head">
        <time class="record-date">
          ${formatDate(date)} ${escapeHtml(plan.time)}
        </time>
        <span class="plan-badge">予定</span>
      </div>

      <p class="activity-text">
        ${escapeHtml(plan.activity)}
      </p>

      <div class="record-actions">
        <button
          type="button"
          data-plan-complete="${escapeHtml(plan.id)}"
          data-date="${date}"
        >
          完了
        </button>
      </div>
    </article>
  `).join("");

  timeline.innerHTML = completedHtml + pendingHtml;

  timeline.querySelectorAll("[data-plan-complete]")
    .forEach(button => {
      button.addEventListener("click", () => {
        completePlan(
          button.dataset.planComplete,
          button.dataset.date
        );
      });
    });
}

/* =========================
   予定
========================= */

planTime.addEventListener("input", () => {
  planTime.value = planTime.value
    .replace(/[^0-9:]/g, "")
    .slice(0, 5);
});

planTime.addEventListener("blur", () => {
  const normalized = normalizeTypedTime(planTime.value);
  if (normalized) planTime.value = normalized;
});

function planOccurs(plan, date) {
  if (date < plan.date) return false;
  if (plan.repeat === "once") return date === plan.date;
  if (plan.repeat === "daily") return true;

  const start = new Date(`${plan.date}T12:00:00`);
  const target = new Date(`${date}T12:00:00`);

  return start.getDay() === target.getDay();
}

function pendingPlans(selectedDate) {
  const dates = [];

  if (selectedDate) {
    dates.push(selectedDate);
  } else {
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const day = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + i
      );
      dates.push(formatInputDate(day));
    }
  }

  return dates.flatMap(date =>
    plans
      .filter(plan =>
        planOccurs(plan, date) &&
        !(
          Array.isArray(plan.deletedDates) &&
          plan.deletedDates.includes(date)
        ) &&
        !records.some(record =>
          record.planId === plan.id &&
          record.date === date
        )
      )
      .map(plan => ({ plan, date }))
  ).sort((a, b) =>
    `${a.date}${a.plan.time}`.localeCompare(
      `${b.date}${b.plan.time}`
    )
  );
}

function resetPlanForm() {
  editingPlanId = null;
  planActivity.value = "";
  planDate.value = formatInputDate(new Date());
  planTime.value = "";
  planRepeat.value = "once";

  document.getElementById("savePlanButton").textContent =
    "予定を登録";

  document.getElementById("cancelPlanButton")
    .classList.add("hidden");
}

function renderPlanList() {
  const list = document.getElementById("planList");

  const visiblePlans = plans.filter(plan => {
    const deletedForDisplay =
      Array.isArray(plan.deletedDates) &&
      plan.deletedDates.includes(
        plan.repeat === "once"
          ? plan.date
          : getToday()
      );

    const completed = records.some(record =>
      record.planId === plan.id &&
      (
        plan.repeat === "once" ||
        record.date === getToday()
      )
    );

    return !completed && !deletedForDisplay;
  });

  const repeatLabels = {
    once: "その日限り",
    daily: "毎日",
    weekly: "毎週"
  };

  list.innerHTML = visiblePlans.length
    ? visiblePlans.map(plan => `
        <article class="plan-list-item">
          <strong>${escapeHtml(plan.activity)}</strong>
          <p>
            ${formatDate(plan.date)}
            ${escapeHtml(plan.time)}
            · ${repeatLabels[plan.repeat] || ""}
          </p>
          <div class="record-actions">
            <button
              type="button"
              data-edit-plan="${escapeHtml(plan.id)}"
            >
              編集
            </button>
            <button
              type="button"
              class="delete-button"
              data-delete-plan="${escapeHtml(plan.id)}"
            >
              削除
            </button>
          </div>
        </article>
      `).join("")
    : '<p class="empty-message">予定はありません。</p>';

  list.querySelectorAll("[data-edit-plan]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const plan = plans.find(
          item => item.id === button.dataset.editPlan
        );

        if (!plan) return;

        editingPlanId = plan.id;
        planActivity.value = plan.activity;
        planDate.value = plan.date;
        planTime.value = plan.time;
        planRepeat.value = plan.repeat;

        document.getElementById("savePlanButton")
          .textContent = "予定を更新";

        document.getElementById("cancelPlanButton")
          .classList.remove("hidden");

        planActivity.focus();
      });
    });

  list.querySelectorAll("[data-delete-plan]")
    .forEach(button => {
      button.addEventListener("click", () => {
        if (!window.confirm(
          "この予定を削除しますか？完了済みの記録は残ります。"
        )) return;

        plans = plans.filter(
          item => item.id !== button.dataset.deletePlan
        );

        saveJson(PLAN_STORAGE_KEY, plans);
        resetPlanForm();
        renderPlanList();
        renderTimeline();
      });
    });
}

document.getElementById("savePlanButton")
  .addEventListener("click", () => {
    const activity = planActivity.value.trim();
    const normalizedTime =
      normalizeTypedTime(planTime.value);

    const message =
      document.getElementById("planMessage");

    if (!activity || !planDate.value || !normalizedTime) {
      message.textContent =
        "内容・日付と正しい時刻を入力してください。";
      return;
    }

    const plan = {
      id: editingPlanId || createRecordId(),
      activity,
      date: planDate.value,
      time: normalizedTime,
      repeat: planRepeat.value,
      ...(editingPlanId
        ? {
            deletedDates:
              plans.find(item =>
                item.id === editingPlanId
              )?.deletedDates || []
          }
        : {})
    };

    plans = editingPlanId
      ? plans.map(item =>
          item.id === editingPlanId ? plan : item
        )
      : [...plans, plan];

    if (!saveJson(PLAN_STORAGE_KEY, plans)) {
      message.textContent = "保存できませんでした。";
      return;
    }

    resetPlanForm();
    renderPlanList();
    renderTimeline();

    message.textContent = "予定を保存しました。";
  });

document.getElementById("cancelPlanButton")
  .addEventListener("click", resetPlanForm);


/* =========================================
   予定完了時の気分入力
========================================= */

let selectedCompleteMood = null;

function renderCompleteMoodInput() {
  const container =
    document.getElementById("completeMoodContainer");

  const guide =
    document.getElementById("completeMoodGuide");

  const s = moodSettings;
  const values = moodValues(s);

  container.replaceChildren();
  container.className = "mood-buttons";

  guide.textContent =
    `${s.min}〜${s.max}（間隔 ${s.step}）`;

  function setCompleteMood(value) {
    selectedCompleteMood = value;
  }

  if (s.method === "buttons" && values.length <= 30) {
    container.style.gridTemplateColumns =
      `repeat(${Math.min(7, values.length)}, minmax(0, 1fr))`;

    values.forEach(value => {
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = formatMood(value);
      button.dataset.mood = String(value);

      button.addEventListener("click", () => {
        setCompleteMood(value);

        container.querySelectorAll("button")
          .forEach(item => {
            const active =
              Number(item.dataset.mood) === value;

            item.classList.toggle("selected", active);
            item.setAttribute(
              "aria-pressed",
              String(active)
            );
          });
      });

      container.append(button);
    });

  } else if (s.method === "slider") {
    container.classList.add("mood-single-input");

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(s.min);
    slider.max = String(s.max);
    slider.step = String(s.step);
    slider.value = String(s.min);

    const output = document.createElement("output");
    output.textContent = formatMood(s.min);

    // 初期位置だけでは気分を確定しない
    selectedCompleteMood = null;

    slider.addEventListener("input", () => {
      const value = Number(slider.value);

      setCompleteMood(value);
      output.textContent = formatMood(value);
    });

    container.append(slider, output);

  } else if (
    s.method === "select" ||
    (s.method === "buttons" && values.length > 30)
  ) {
    container.classList.add("mood-single-input");

    const select = document.createElement("select");

    select.append(
      new Option("選択してください", "")
    );

    values.forEach(value => {
      select.append(
        new Option(formatMood(value), String(value))
      );
    });

    select.addEventListener("change", () => {
      setCompleteMood(
        select.value === ""
          ? null
          : Number(select.value)
      );
    });

    container.append(select);

  } else {
    container.classList.add("mood-single-input");

    const input = document.createElement("input");

    input.type = "number";
    input.step = "any";
    input.min = String(s.min);
    input.max = String(s.max);
    input.placeholder = `${s.min}〜${s.max}`;

    input.addEventListener("input", () => {
      setCompleteMood(
        input.value === ""
          ? null
          : Number(input.value)
      );
    });

    container.append(input);
  }
}

function completePlan(id, date) {
  const plan = plans.find(item => item.id === id);
  if (!plan) return;

  completingPlan = { plan, date };

  document.getElementById("completeDateLabel")
    .textContent = `${formatDate(date)} ${plan.time}`;

  document.getElementById("completeActivity")
    .textContent = plan.activity;

  setCompleteCurrentTime();

  selectedCompleteMood = null;
  renderCompleteMoodInput();

  document.getElementById("completeMessage")
    .textContent = "";

  const panel = document.getElementById("completePanel");
  panel.classList.remove("hidden");

  panel.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

document.getElementById("cancelCompleteButton")
  .addEventListener("click", () => {
    completingPlan = null;

    document.getElementById("completePanel")
      .classList.add("hidden");
  });

const completeTimeInput =
  document.getElementById("completeTime");

function setCompleteCurrentTime() {
  const now = new Date();

  completeTimeInput.value =
    `${String(now.getHours()).padStart(2, "0")}:` +
    String(now.getMinutes()).padStart(2, "0");
}

document.getElementById("completeNowButton")
  .addEventListener("click", setCompleteCurrentTime);

completeTimeInput.addEventListener("input", () => {
  completeTimeInput.value = completeTimeInput.value
    .replace(/[^0-9:]/g, "")
    .slice(0, 5);
});

completeTimeInput.addEventListener("blur", () => {
  const normalized =
    normalizeTypedTime(completeTimeInput.value);

  if (normalized) completeTimeInput.value = normalized;
});

document.getElementById("finishPlanButton")
  .addEventListener("click", () => {
    if (!completingPlan) return;

    const completionTime =
      normalizeTypedTime(completeTimeInput.value);

    const mood = selectedCompleteMood;

    if (!completionTime || !validMood(mood, moodSettings)) {
      document.getElementById("completeMessage")
        .textContent =
        "正しい完了時刻と気分を入力してください。";
      return;
    }

    const { plan, date } = completingPlan;

    if (records.some(record =>
      record.planId === plan.id &&
      record.date === date
    )) return;

    const record = {
      id: createRecordId(),
      planId: plan.id,
      date,
      time: completionTime,
      activity: plan.activity,
      mood: Number(mood),
      moodSettings: { ...moodSettings }
    };

    records.push(record);

    if (!saveJson(STORAGE_KEY, records)) {
      records.pop();
      return;
    }

    completingPlan = null;

    document.getElementById("completePanel")
      .classList.add("hidden");

    renderTimeline();
    renderPlanList();
    drawGraph();
  });

resetPlanForm();
renderPlanList();

/* =========================
   日別メモ
========================= */

dailyMemoInput.addEventListener("input", () => {
  autoResizeTextarea(dailyMemoInput);
  dailyMemoMessage.textContent = "";
});

saveDailyMemoButton.addEventListener(
  "click",
  saveDailyMemo
);

function loadDailyMemo(date) {
  const enabled = Boolean(date);

  dailyMemoInput.disabled = !enabled;
  saveDailyMemoButton.disabled = !enabled;

  dailyMemoInput.value = enabled
    ? dailyMemos[date] || ""
    : "";

  dailyMemoInput.placeholder = enabled
    ? "体調、予定、その日の振り返りなど"
    : "表示日を選択すると、その日のメモを入力できます";

  dailyMemoMessage.textContent = "";
  autoResizeTextarea(dailyMemoInput);
}

function saveDailyMemo() {
  const date = timelineDateInput.value;

  if (!date) {
    dailyMemoMessage.textContent =
      "表示日を選択してください。";
    return;
  }

  const memo = dailyMemoInput.value.trim();

  if (memo) {
    dailyMemos[date] = memo;
  } else {
    delete dailyMemos[date];
  }

  const saved = saveJson(
    DAILY_MEMO_STORAGE_KEY,
    dailyMemos
  );

  dailyMemoMessage.textContent = saved
    ? "保存しました。"
    : "保存できませんでした。";
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height =
    `${Math.max(textarea.scrollHeight, 88)}px`;
}

/* =========================================
   グラフ
========================================= */

const moodGraphMode =
  document.getElementById("moodGraphMode");

const graphCanvas =
  document.getElementById("moodChart");

const graphEmpty =
  document.getElementById("graphEmpty");

moodGraphMode.addEventListener("change", drawGraph);

graphDateInput.addEventListener("change", () => {
  document.getElementById("graphFilterMessage")
    .textContent = "";

  drawGraph();
});

document.getElementById("graphResetButton")
  .addEventListener("click", () => {
    graphDateInput.value = "";

    document.getElementById("graphFilterMessage")
      .textContent = "";

    drawGraph();
  });

function getGraphRecords() {
  const selectedDate = graphDateInput.value;

  return getSortedRecords().filter(record => {
    return !selectedDate || record.date === selectedDate;
  });
}


/* =========================================
   グラフの説明文を更新
========================================= */

function updateGraphNote() {
  const note = document.getElementById("graphNote");
  const mode = document.getElementById("moodGraphMode");

  if (!note || !mode) return;

  if (mode.value === "normalized") {
    note.textContent =
      "横軸：時刻　縦軸：気分（0〜100％換算）";
  } else {
    note.textContent =
      `横軸：時刻　縦軸：気分（${formatMood(moodSettings.min)}〜${formatMood(moodSettings.max)}）`;
  }
}


function drawGraph() {
  if (typeof Chart === "undefined") {
    graphEmpty.textContent =
      "グラフライブラリを読み込めませんでした。";
    graphEmpty.classList.remove("hidden");
    return;
  }

  const items = getGraphRecords().filter(record =>
    Number.isFinite(Number(record.mood))
  );

  const normalized =
    moodGraphMode.value === "normalized";

  if (moodChart) {
    moodChart.destroy();
    moodChart = null;
  }

  if (items.length === 0) {
    graphCanvas.classList.add("hidden");
    graphEmpty.classList.remove("hidden");
    graphEmpty.textContent =
      "表示できる記録がありません。";
    return;
  }

  graphCanvas.classList.remove("hidden");
  graphEmpty.classList.add("hidden");

  const values = items.map(record =>
    normalized
      ? normalizedMood(record)
      : Number(record.mood)
  );

  // 元の数値表示では、記録ごとの設定範囲も考慮
  const rawMinimum = Math.min(
    ...values,
    ...items.map(record =>
      settingsForRecord(record).min
    )
  );

  const rawMaximum = Math.max(
    ...values,
    ...items.map(record =>
      settingsForRecord(record).max
    )
  );

  const yMinimum = normalized ? 0 : rawMinimum;
  const yMaximum = normalized ? 100 : rawMaximum;

  
  // 表示日が指定されているか
  const singleDay = Boolean(graphDateInput.value);

  // 日付と時刻を数値（タイムスタンプ）に変換
  function recordTimestamp(record) {
    const [year, month, day] =
      record.date.split("-").map(Number);

    const [hour, minute] =
      record.time.split(":").map(Number);

    return new Date(
      year,
      month - 1,
      day,
      hour,
      minute
    ).getTime();
  }

  // 記録した実際の日時を横軸の位置にする
  const points = items.map((record, index) => ({
    x: recordTimestamp(record),
    y: values[index]
  }));

  // 1日表示の場合は0:00〜翌日0:00を横軸にする
  let xMinimum;
  let xMaximum;

  if (singleDay) {
    const [year, month, day] =
      graphDateInput.value.split("-").map(Number);

    xMinimum = new Date(
      year, month - 1, day, 0, 0
    ).getTime();

    xMaximum = new Date(
      year, month - 1, day + 1, 0, 0
    ).getTime();
  }


  const pointColors = items.map(record =>
    moodColor(
      Number(record.mood),
      settingsForRecord(record)
    )
  );

  const ctx = graphCanvas.getContext("2d");

  moodChart = new Chart(ctx, {
    type: "line",

    data: {
      datasets: [{
        label: normalized
          ? "気分（0〜100％換算）"
          : "気分（元の数値）",

        data: points,

        borderColor: "#58a98a",
        backgroundColor: "rgba(88,169,138,0.15)",

        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,

        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,

        tension: 0.15,
        fill: false,
        spanGaps: false
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      interaction: {
        intersect: false,
        mode: "nearest"
      },

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          callbacks: {
            title(context) {
              const index = context[0].dataIndex;
              const record = items[index];

              return `${record.date} ${record.time}`;
            },

            label(context) {
              const index = context.dataIndex;
              const record = items[index];

              const original =
                formatMood(Number(record.mood));

              if (!normalized) {
                return `気分：${original}`;
              }

              const percent =
                normalizedMood(record).toFixed(1);

              return `気分：${percent}％（元の値：${original}）`;
            },

            afterLabel(context) {
              const record = items[context.dataIndex];
              const settings = settingsForRecord(record);

              return [
                `活動：${record.activity}`,
                `記録時の範囲：${settings.min}〜${settings.max}`
              ];
            }
          }
        }
      },

      scales: {
        
        x: {
          type: "linear",

          // 1日表示では0:00〜24:00に固定
          min: singleDay ? xMinimum : undefined,
          max: singleDay ? xMaximum : undefined,

          ticks: {
            maxTicksLimit: singleDay ? 9 : 8,

            callback(value) {
              const date = new Date(Number(value));

              if (singleDay) {
                // 1日表示では時刻を表示
                if (value === xMaximum) {
                  return "24:00";
                }

                return (
                  String(date.getHours()).padStart(2, "0") +
                  ":" +
                  String(date.getMinutes()).padStart(2, "0")
                );
              }

              // 全期間表示では日付と時刻を表示
              return (
                String(date.getMonth() + 1).padStart(2, "0") +
                "/" +
                String(date.getDate()).padStart(2, "0") +
                " " +
                String(date.getHours()).padStart(2, "0") +
                ":" +
                String(date.getMinutes()).padStart(2, "0")
              );
            }
          },

          title: {
            display: true,
            text: singleDay
              ? "時刻"
              : "日付・時刻"
          }
        },


        y: {
          min: yMinimum,
          max: yMaximum,

          ticks: {
            callback(value) {
              if (normalized) {
                return `${value}%`;
              }

              return formatMood(Number(value));
            }
          },

          title: {
            display: true,
            text: normalized
              ? "気分（％）"
              : "気分"
          }
        }
      }
    }
  });

  const graphNote =
    document.getElementById("graphNote");

  if (graphNote) {
    graphNote.textContent = normalized
      ? "横軸：実際の日時　縦軸：気分（0〜100％換算）"
      : "横軸：実際の日時　縦軸：気分（元の数値）";
  }

}

  updateGraphNote();


/* =========================================
   検索
========================================= */

const searchStartDate =
  document.getElementById("searchStartDate");

const searchEndDate =
  document.getElementById("searchEndDate");

const searchKeyword =
  document.getElementById("searchKeyword");

const searchResults =
  document.getElementById("searchResults");

const searchMessage =
  document.getElementById("searchMessage");

const searchResultCount =
  document.getElementById("searchResultCount");

document.getElementById("searchButton")
  .addEventListener("click", runSearch);

document.getElementById("searchClearButton")
  .addEventListener("click", () => {
    searchStartDate.value = "";
    searchEndDate.value = "";
    searchKeyword.value = "";
    searchMoodInput.value = "";

    searchMessage.textContent = "";

    runSearch();
  });

function runSearch() {
  const start = searchStartDate.value;
  const end = searchEndDate.value;

  const keyword =
    searchKeyword.value.trim().toLowerCase();

  const moodValue =
    searchMoodInput.value.trim();

  if (start && end && start > end) {
    searchMessage.textContent =
      "終了日は開始日以降にしてください。";
    return;
  }

  if (
    moodValue !== "" &&
    !Number.isFinite(Number(moodValue))
  ) {
    searchMessage.textContent =
      "気分には数値を入力してください。";
    return;
  }

  searchMessage.textContent = "";

  const results = getSortedRecords().filter(record => {
    if (start && record.date < start) return false;
    if (end && record.date > end) return false;

    if (
      keyword &&
      !String(record.activity || "")
        .toLowerCase()
        .includes(keyword)
    ) {
      return false;
    }

    if (moodValue !== "") {
      if (
        !Number.isFinite(Number(record.mood)) ||
        Math.abs(
          Number(record.mood) - Number(moodValue)
        ) > 1e-8
      ) {
        return false;
      }
    }

    return true;
  });

  searchResultCount.textContent =
    `${results.length}件`;

  if (results.length === 0) {
    searchResults.innerHTML =
      '<p class="empty-message">該当する記録はありません。</p>';
    return;
  }

  searchResults.innerHTML = results.map(record => {
    const settings = settingsForRecord(record);

    return `
      <article class="timeline-item">
        <div class="record-head">
          <time class="record-date">
            ${formatDate(record.date)}
            ${escapeHtml(record.time)}
          </time>

          <span
            class="mood-badge"
            style="background:${moodColor(
              Number(record.mood),
              settings
            )}"
          >
            気分 ${formatMood(Number(record.mood))}
          </span>
        </div>

        <p class="activity-text">
          ${escapeHtml(record.activity)}
        </p>

        <p class="mood-guide">
          記録時の設定：
          ${settings.min}〜${settings.max}
          （間隔 ${settings.step}）
        </p>

        <div class="record-actions">
          <button
            type="button"
            data-search-edit="${escapeHtml(record.id)}"
          >
            編集
          </button>
        </div>
      </article>
    `;
  }).join("");

  searchResults.querySelectorAll("[data-search-edit]")
    .forEach(button => {
      button.addEventListener("click", () => {
        editRecord(button.dataset.searchEdit);
      });
    });
}

/* =========================================
   定期的な活動
========================================= */

document.getElementById("openRoutineButton")
  .addEventListener("click", openRoutineModal);

document.getElementById("closeRoutineButton")
  .addEventListener("click", closeRoutineModal);

document.getElementById("toggleRoutineSettingsButton")
  .addEventListener("click", () => {
    routineSettingsOpen = !routineSettingsOpen;
    renderRoutineActivities();
  });

document.getElementById("addRoutineButton")
  .addEventListener("click", addRoutineActivity);

newRoutineInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addRoutineActivity();
});

routineModal.addEventListener("click", event => {
  if (event.target === routineModal) {
    closeRoutineModal();
  }
});

routineList.addEventListener("click", event => {
  const button =
    event.target.closest("[data-routine-index]");

  if (!button) return;

  const index = Number(button.dataset.routineIndex);

  activityInput.value =
    routineActivities[index] || "";

  closeRoutineModal();
  activityInput.focus();
});

routineEditList.addEventListener("change", event => {
  const input =
    event.target.closest("[data-routine-edit-index]");

  if (!input) return;

  const index = Number(input.dataset.routineEditIndex);
  const value = input.value.trim();

  if (!value) {
    renderRoutineActivities();
    return;
  }

  routineActivities[index] = value;

  saveJson(
    ROUTINE_STORAGE_KEY,
    routineActivities
  );

  renderRoutineActivities();
});

routineEditList.addEventListener("click", event => {
  const button =
    event.target.closest("[data-routine-delete-index]");

  if (!button) return;

  const index = Number(button.dataset.routineDeleteIndex);

  routineActivities.splice(index, 1);

  saveJson(
    ROUTINE_STORAGE_KEY,
    routineActivities
  );

  renderRoutineActivities();
});

function openRoutineModal() {
  routineSettingsOpen = false;
  renderRoutineActivities();

  routineModal.classList.remove("hidden");
  routineModal.setAttribute("aria-hidden", "false");

  document.body.classList.add("modal-open");
}

function closeRoutineModal() {
  routineModal.classList.add("hidden");
  routineModal.setAttribute("aria-hidden", "true");

  document.body.classList.remove("modal-open");
}

function addRoutineActivity() {
  const value = newRoutineInput.value.trim();

  if (!value) {
    newRoutineInput.focus();
    return;
  }

  routineActivities.push(value);
  newRoutineInput.value = "";

  saveJson(
    ROUTINE_STORAGE_KEY,
    routineActivities
  );

  renderRoutineActivities();
  newRoutineInput.focus();
}

function renderRoutineActivities() {
  if (routineActivities.length === 0) {
    routineList.innerHTML = `
      <p class="routine-empty">
        設定から、よくする活動を追加してください。
      </p>
    `;
  } else {
    routineList.innerHTML = routineActivities
      .map((activity, index) => `
        <button
          type="button"
          class="routine-choice"
          data-routine-index="${index}"
        >
          ${escapeHtml(activity)}
        </button>
      `)
      .join("");
  }

  routineSettings.classList.toggle(
    "hidden",
    !routineSettingsOpen
  );

  document.getElementById(
    "toggleRoutineSettingsButton"
  ).textContent = routineSettingsOpen
    ? "設定を閉じる"
    : "設定";

  routineEditList.innerHTML = routineActivities
    .map((activity, index) => `
      <div class="routine-edit-row">
        <input
          type="text"
          maxlength="100"
          value="${escapeHtml(activity)}"
          data-routine-edit-index="${index}"
        >
        <button
          type="button"
          data-routine-delete-index="${index}"
        >
          削除
        </button>
      </div>
    `)
    .join("");
}

/* =========================================
   印刷する期間の選択
========================================= */

const printDialog =
  document.getElementById("printDialog");

const printStartDate =
  document.getElementById("printStartDate");

const printEndDate =
  document.getElementById("printEndDate");

const printDialogMessage =
  document.getElementById("printDialogMessage");

document.getElementById("openPrintDialogButton")
  .addEventListener("click", () => {
    const today = getToday();

    printStartDate.value =
      timelineDateInput.value || today;

    printEndDate.value = printStartDate.value;

    printDialogMessage.textContent = "";

    printDialog.classList.remove("hidden");
    printDialog.setAttribute("aria-hidden", "false");

    printStartDate.focus();
  });

function closePrintDialog() {
  printDialog.classList.add("hidden");
  printDialog.setAttribute("aria-hidden", "true");
}

document.getElementById("cancelPrintButton")
  .addEventListener("click", closePrintDialog);

printDialog.addEventListener("click", event => {
  if (event.target === printDialog) {
    closePrintDialog();
  }
});

document.getElementById("executePrintButton")
  .addEventListener("click", () => {
    const start = printStartDate.value;
    const end = printEndDate.value;

    if (!start || !end || start > end) {
      printDialogMessage.textContent =
        "開始日と終了日を正しい順序で選んでください。";
      return;
    }

    const days = [];

    const current =
      new Date(`${start}T12:00:00`);

    const last =
      new Date(`${end}T12:00:00`);

    while (
      current <= last &&
      days.length <= 366
    ) {
      days.push(formatInputDate(current));
      current.setDate(current.getDate() + 1);
    }

    if (days.length > 366) {
      printDialogMessage.textContent =
        "印刷期間は366日以内にしてください。";
      return;
    }

    document.getElementById("dailyPrintRoot")
      .innerHTML = days.map(buildDailyPrintPage).join("");

    closePrintDialog();

    document.body.classList.add("print-daily");

    requestAnimationFrame(() => {
      window.print();
    });
  });

window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-daily");
});

/* =========================================
   1日ごとの印刷ページ
========================================= */

/* =========================================
   1日ごとの印刷ページ
   1ページ最大40件（左20件・右20件）
========================================= */

function buildDailyPrintPage(date) {
  const items = getSortedRecords().filter(
    record => record.date === date
  );

  const memo = dailyMemos[date] || "";

  // 40件ずつページに分割
  const pages = [];

  for (let i = 0; i < items.length; i += 40) {
    pages.push(items.slice(i, i + 40));
  }

  // 記録がない日も1ページ作る
  if (pages.length === 0) {
    pages.push([]);
  }

  // 記録1件分のHTML
  function renderColumn(part) {
    if (part.length === 0) {
      return '<p class="daily-print-empty">記録なし</p>';
    }

    return part.map(record => `
      <div class="daily-print-record">
        <div class="daily-print-record-heading">
          <strong>
            ${escapeHtml(record.time)}
          </strong>

          <span>
            気分 ${formatMood(Number(record.mood))}
          </span>
        </div>

        <p>${escapeHtml(record.activity)}</p>
      </div>
    `).join("");
  }

  return pages.map((pageItems, pageIndex) => {
    // 各ページで左20件、右20件
    const leftItems = pageItems.slice(0, 20);
    const rightItems = pageItems.slice(20, 40);

    const pageNumber = pageIndex + 1;
    const totalPages = pages.length;

    // 記録が多い場合は文字サイズを調整
    const recordFont = Math.max(
      5.5,
      Math.min(
        8,
        80 / Math.max(
          10,
          leftItems.length,
          rightItems.length
        )
      )
    );

    return `
      <section
        class="daily-print-page"
        style="--daily-record-font:${recordFont}pt"
      >
        <h1>
          ${escapeHtml(date.replace(/-/g, "/"))}
          活動記録表

          ${totalPages > 1
            ? `（${pageNumber}/${totalPages}）`
            : ""}
        </h1>

        <section class="daily-print-graph">
          <h2>グラフ</h2>

          ${buildDailyGraphSvg(items)}
        </section>

        <div class="daily-print-columns">
          <section class="daily-print-column">
            <div class="daily-print-list">
              ${renderColumn(leftItems)}
            </div>
          </section>

          <section class="daily-print-column">
            <div class="daily-print-list">
              ${renderColumn(rightItems)}
            </div>
          </section>
        </div>

        <section class="daily-print-memo">
          <h2>メモ</h2>

          <p>
            ${pageIndex === 0
              ? (memo ? escapeHtml(memo) : "メモなし")
              : "（メモは1ページ目に記載）"}
          </p>
        </section>
      </section>
    `;
  }).join("");
}


/* =========================================
   印刷用グラフ
   記録時の気分設定に対応
========================================= */

function buildDailyGraphSvg(items) {
  const left = 44;
  const right = 716;
  const top = 16;
  const bottom = 177;

  // 記録がない場合
  if (items.length === 0) {
    return `
      <svg viewBox="0 0 750 205">
        <rect
          width="750"
          height="205"
          fill="white"
        />
        <text
          x="375"
          y="105"
          text-anchor="middle"
          fill="#777"
        >
          記録なし
        </text>
      </svg>
    `;
  }

  // グラフの表示方法
  const normalized =
    document.getElementById("moodGraphMode")
      .value === "normalized";

  const values = items.map(item =>
    normalized
      ? normalizedMood(item)
      : Number(item.mood)
  );

  const minMood = normalized
    ? 0
    : Math.min(
        ...values,
        ...items.map(item =>
          settingsForRecord(item).min
        )
      );

  const maxMood = normalized
    ? 100
    : Math.max(
        ...values,
        ...items.map(item =>
          settingsForRecord(item).max
        )
      );

  const moodSpan = Math.max(
    1e-9,
    maxMood - minMood
  );

  const y = mood =>
    bottom -
    (Number(mood) - minMood) *
    (bottom - top) / moodSpan;

  const x = time => {
    const normalizedTime = getSortableTime(time);

    const minutes =
      Number(normalizedTime.slice(0, 2)) * 60 +
      Number(normalizedTime.slice(3, 5));

    return left +
      minutes * (right - left) / 1440;
  };

  // 横線と縦軸の目盛り
  const grid = Array.from(
    { length: 7 },
    (_, i) => minMood + moodSpan * i / 6
  ).map(value => `
    <line
      x1="${left}"
      y1="${y(value)}"
      x2="${right}"
      y2="${y(value)}"
      stroke="#dde4ef"
    />

    <text
      x="36"
      y="${y(value) + 4}"
      text-anchor="end"
    >
      ${normalized
        ? Number(value.toFixed(1)) + "%"
        : Number(value.toFixed(2))}
    </text>
  `).join("");

  // 時刻の目盛り
  const ticks = [0, 6, 12, 18, 24]
    .map(hour => {
      const position =
        left + hour * (right - left) / 24;

      return `
        <line
          x1="${position}"
          y1="${top}"
          x2="${position}"
          y2="${bottom}"
          stroke="#dde4ef"
        />

        <text
          x="${position}"
          y="195"
          text-anchor="middle"
        >
          ${hour}:00
        </text>
      `;
    }).join("");

  // 折れ線
  const points = items.map((item, index) =>
    `${x(item.time)},${y(values[index])}`
  ).join(" ");

  // 各記録の点
  const dots = items.map((item, index) => `
    <circle
      cx="${x(item.time)}"
      cy="${y(values[index])}"
      r="4"
      fill="${moodColor(
        Number(item.mood),
        settingsForRecord(item)
      )}"
    />
  `).join("");

  return `
    <svg
      viewBox="0 0 750 205"
      role="img"
      aria-label="時刻に対する気分の推移"
    >
      <rect
        x="0"
        y="0"
        width="750"
        height="205"
        fill="white"
      />

      ${grid}
      ${ticks}

      ${items.length > 1
        ? `
          <polyline
            points="${points}"
            fill="none"
            stroke="#3973be"
            stroke-width="2.5"
          />
        `
        : ""}

      ${dots}
    </svg>
  `;
}

/* =========================================
   下部メニュー
========================================= */

document.querySelectorAll(".nav-button")
  .forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

function showPage(pageId) {
  if (pageId === "planPage") {
    renderPlanList();
  }

  document.querySelectorAll(".page")
    .forEach(page => {
      page.classList.toggle(
        "active",
        page.id === pageId
      );
    });

  document.querySelectorAll(".nav-button")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === pageId
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageId === "timelinePage") {
    renderTimeline();
    loadDailyMemo(timelineDateInput.value);
  }

  if (pageId === "graphPage") {
    requestAnimationFrame(drawGraph);
  }
}

/* =========================================
   データの移行
========================================= */

const transferDialog =
  document.getElementById("transferDialog");

const transferMessage =
  document.getElementById("transferMessage");

const importDataFile =
  document.getElementById("importDataFile");

function closeTransferDialog() {
  transferDialog.classList.add("hidden");
  transferDialog.setAttribute("aria-hidden", "true");
}

document.getElementById("openTransferDialogButton")
  .addEventListener("click", () => {
    transferMessage.textContent = "";
    transferDialog.classList.remove("hidden");
    transferDialog.setAttribute("aria-hidden", "false");
  });

document.getElementById("closeTransferDialogButton")
  .addEventListener("click", closeTransferDialog);

transferDialog.addEventListener("click", event => {
  if (event.target === transferDialog) {
    closeTransferDialog();
  }
});

document.getElementById("exportDataButton")
  .addEventListener("click", () => {
    const backup = {
      version: 2,
      exportedAt: new Date().toISOString(),
      records,
      plans,
      routineActivities,
      dailyMemos,
      moodSettings
    };

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `活動記録表バックアップ_${getToday()}.json`;

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

document.getElementById("importDataButton")
  .addEventListener("click", () => {
    importDataFile.click();
  });

importDataFile.addEventListener("change", async () => {
  const file = importDataFile.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (
      !data ||
      !Array.isArray(data.records)
    ) {
      throw new Error("バックアップ形式が正しくありません。");
    }

    if (!window.confirm(
      "現在のデータをバックアップの内容で置き換えますか？"
    )) {
      return;
    }

    const nextRecords = data.records;
    const nextPlans = Array.isArray(data.plans)
      ? data.plans : [];

    const nextRoutines =
      Array.isArray(data.routineActivities)
        ? data.routineActivities : [];

    const nextMemos =
      data.dailyMemos &&
      typeof data.dailyMemos === "object" &&
      !Array.isArray(data.dailyMemos)
        ? data.dailyMemos : {};

    const nextMoodSettings =
      normalizeMoodSettings(
        data.moodSettings || LEGACY_MOOD_SETTINGS
      );

    // 書き込み前に容量を確認
    const updates = [
      [STORAGE_KEY, nextRecords],
      [PLAN_STORAGE_KEY, nextPlans],
      [ROUTINE_STORAGE_KEY, nextRoutines],
      [DAILY_MEMO_STORAGE_KEY, nextMemos],
      [MOOD_SETTINGS_KEY, nextMoodSettings]
    ];

    const previousValues = updates.map(([key]) => [
      key,
      localStorage.getItem(key)
    ]);

    try {
      updates.forEach(([key, value]) => {
        localStorage.setItem(
          key,
          JSON.stringify(value)
        );
      });
    } catch (error) {
      previousValues.forEach(([key, value]) => {
        try {
          if (value === null) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, value);
          }
        } catch (_) {}
      });

      throw error;
    }

    records = nextRecords;
    plans = nextPlans;
    routineActivities = nextRoutines;
    dailyMemos = nextMemos;
    moodSettings = nextMoodSettings;

    resetForm();
    resetPlanForm();
    renderRoutineActivities();
    renderPlanList();
    renderTimeline();
    drawGraph();
    runSearch();
    loadDailyMemo(timelineDateInput.value);

    transferMessage.textContent =
      "データを読み込みました。";

  } catch (error) {
    transferMessage.textContent =
      `読み込みに失敗しました：${error.message}`;
  } finally {
    importDataFile.value = "";
  }
});

/* =========================================
   ローカルストレージ
========================================= */

function loadJson(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    if (text === null) return fallback;

    return JSON.parse(text);
  } catch (error) {
    console.error("データ読み込みエラー", error);
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
    return true;
  } catch (error) {
    console.error("データ保存エラー", error);
    alert("データを保存できませんでした。");
    return false;
  }
}

/* =========================================
   日付・時刻
========================================= */

function getToday() {
  return formatInputDate(new Date());
}

function formatInputDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDate(value) {
  if (!value) return "";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function setCurrentDateTime() {
  const now = new Date();

  dateInput.value = formatInputDate(now);

  timeInput.value =
    `${String(now.getHours()).padStart(2, "0")}:` +
    String(now.getMinutes()).padStart(2, "0");
}

function normalizeTypedTime(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  let hours;
  let minutes;

  if (text.includes(":")) {
    const parts = text.split(":");

    if (
      parts.length !== 2 ||
      !/^\d{1,2}$/.test(parts[0]) ||
      !/^\d{1,2}$/.test(parts[1])
    ) {
      return null;
    }

    hours = Number(parts[0]);
    minutes = Number(parts[1]);

  } else {
    if (!/^\d{1,4}$/.test(text)) {
      return null;
    }

    const padded = text.padStart(4, "0");

    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2));
  }

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0")
  );
}

function getSortableTime(time) {
  return normalizeTypedTime(time) || "00:00";
}

function getSortedRecords() {
  return [...records].sort((a, b) => {
    const keyA =
      `${a.date || ""} ${getSortableTime(a.time)}`;

    const keyB =
      `${b.date || ""} ${getSortableTime(b.time)}`;

    return keyA.localeCompare(keyB);
  });
}

/* =========================================
   気分の表示
========================================= */

function formatMood(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "—";

  const formatted = Number(n.toPrecision(12));

  return formatted > 0
    ? `+${formatted}`
    : String(formatted);
}

function moodColor(value, settings = moodSettings) {
  const s = normalizeMoodSettings(settings);

  const range = s.max - s.min;

  if (range <= 0) {
    return "#dce9e3";
  }

  const ratio = Math.max(
    0,
    Math.min(1, (value - s.min) / range)
  );

  // 低い気分：青
  // 中間：薄い緑
  // 高い気分：オレンジ
  if (ratio < 0.35) {
    return "#b8d6f4";
  }

  if (ratio < 0.65) {
    return "#cce8d5";
  }

  return "#f7cfaa";
}

/* =========================================
   共通処理
========================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createRecordId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

/* =========================================
   初期化
========================================= */


function initializeApp() {
  loadNotices();
  setCurrentDateTime();

  // 時系列・グラフの初期表示日を本日にする
  const today = formatInputDate(new Date());

  timelineDateInput.value = today;
  graphDateInput.value = today;

  renderMoodInput();

  renderRoutineActivities();
  renderPlanList();
  renderTimeline();

  loadDailyMemo(timelineDateInput.value);

  // グラフの初期表示
  if (typeof Chart !== "undefined") {
    drawGraph();
  }

  // 検索画面の初期表示
  searchResultCount.textContent = "0件";

  // Escキーでダイアログを閉じる
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    closeRoutineModal();
    closePrintDialog();
    closeTransferDialog();
  });
}

/* =========================================
   notices.json お知らせ表示
========================================= */

async function loadNotices() {
  const panel = document.getElementById("noticesPanel");
  const list = document.getElementById("noticesList");

  if (!panel || !list) return;

  try {
    // キャッシュによる古いお知らせの表示を防ぐ
    const response = await fetch(
      "./notices.json?t=" + Date.now(),
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data = await response.json();

    const notices = Array.isArray(data.notices)
      ? data.notices
      : [];

    const now = Date.now();

    const activeNotices = notices.filter(notice => {
      if (!notice || !notice.message) return false;

      const start = notice.start
        ? Date.parse(notice.start)
        : -Infinity;

      const end = notice.end
        ? Date.parse(notice.end)
        : Infinity;

      if (Number.isNaN(start) || Number.isNaN(end)) {
        return false;
      }

      return now >= start && now < end;
    });

    list.replaceChildren();

    activeNotices.forEach(notice => {
      const article = document.createElement("article");
      article.className = "notice-item";

      const title = document.createElement("h3");
      title.textContent = notice.title || "お知らせ";

      const message = document.createElement("p");
      message.textContent = notice.message;

      article.append(title, message);
      list.append(article);
    });

    panel.classList.toggle(
      "hidden",
      activeNotices.length === 0
    );

  } catch (error) {
    console.warn(
      "お知らせの取得に失敗しました。",
      error
    );

    list.replaceChildren();
    panel.classList.add("hidden");
  }
}

initializeApp();
