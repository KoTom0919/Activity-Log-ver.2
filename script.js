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

const moodButtons = [
  ...document.querySelectorAll("#moodButtons button")
];

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

document
  .getElementById("nowButton")
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

moodButtons.forEach(button => {
  button.addEventListener("click", () => {
    selectMood(Number(button.dataset.mood));
  });
});

function selectMood(mood) {
  selectedMood = mood;

  moodButtons.forEach(button => {
    const selected =
      mood !== null &&
      Number(button.dataset.mood) === mood;

    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

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

  if (selectedMood === null) {
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
    mood: selectedMood
  };

  if (wasEditing) {
    records = records.map(item =>
      item.id === editingId ? record : item
    );
  } else {
    records.push(record);
  }

  saveJson(STORAGE_KEY, records);
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
  selectMood(Number(record.mood));

  saveButton.textContent = "更新する";
  cancelEditButton.classList.remove("hidden");

  showFormMessage("");
  showPage("inputPage");
  activityInput.focus();
}

function deleteRecord(id) {
  if (!window.confirm("この記録を削除しますか？")) return;

  records = records.filter(item => item.id !== id);
  saveJson(STORAGE_KEY, records);
  renderTimeline();
  drawGraph();
}

document
  .getElementById("clearAllButton")
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

document
  .getElementById("timelineResetButton")
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

  document
    .getElementById("clearAllButton")
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
          style="background:${moodColor(Number(record.mood))}"
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
          編集・完了
        </button>
      </div>
    </article>
  `).join("");

  timeline.innerHTML = completedHtml + pendingHtml;

  timeline
    .querySelectorAll("[data-plan-complete]")
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
    const completed = records.some(record =>
      record.planId === plan.id &&
      (
        plan.repeat === "once" ||
        record.date === getToday()
      )
    );
    return !completed;
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

  list
    .querySelectorAll("[data-edit-plan]")
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

        document.getElementById("savePlanButton").textContent =
          "予定を更新";
        document.getElementById("cancelPlanButton")
          .classList.remove("hidden");

        planActivity.focus();
      });
    });

  list
    .querySelectorAll("[data-delete-plan]")
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

document
  .getElementById("savePlanButton")
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
      repeat: planRepeat.value
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

document
  .getElementById("cancelPlanButton")
  .addEventListener("click", resetPlanForm);

function completePlan(id, date) {
  const plan = plans.find(item => item.id === id);
  if (!plan) return;

  completingPlan = { plan, date };

  document.getElementById("completeDateLabel").textContent =
    `${formatDate(date)} ${plan.time}`;
  document.getElementById("completeActivity").value =
    plan.activity;
  document.getElementById("completeMood").value = "";
  document.getElementById("completeMessage").textContent = "";

  const panel = document.getElementById("completePanel");
  panel.classList.remove("hidden");
  panel.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

document
  .getElementById("cancelCompleteButton")
  .addEventListener("click", () => {
    completingPlan = null;
    document.getElementById("completePanel")
      .classList.add("hidden");
  });

document
  .getElementById("finishPlanButton")
  .addEventListener("click", () => {
    if (!completingPlan) return;

    const activity = document
      .getElementById("completeActivity")
      .value.trim();
    const mood =
      document.getElementById("completeMood").value;

    if (!activity || mood === "") {
      document.getElementById("completeMessage").textContent =
        "活動内容と気分を入力してください。";
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
      time: plan.time,
      activity,
      mood: Number(mood)
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

/* =========================
   グラフ
========================= */

graphDateInput.addEventListener("change", () => {
  document.getElementById("graphFilterMessage").textContent =
    "";
  drawGraph();
});

document
  .getElementById("graphResetButton")
  .addEventListener("click", () => {
    graphDateInput.value = "";
    document.getElementById("graphFilterMessage").textContent =
      "";
    drawGraph();
  });

function getGraphRecords() {
  const selectedDate = graphDateInput.value;

  return getSortedRecords().filter(record =>
    !selectedDate || record.date === selectedDate
  );
}

function drawGraph() {
  const canvas = document.getElementById("moodChart");
  const emptyMessage =
    document.getElementById("graphEmpty");
  const items = getGraphRecords();

  if (moodChart) {
    moodChart.destroy();
    moodChart = null;
  }

  canvas.classList.toggle("hidden", items.length === 0);
  emptyMessage.classList.toggle("hidden", items.length > 0);

  if (items.length === 0) {
    emptyMessage.textContent =
      "この日の記録はありません。";
    return;
  }

  if (typeof Chart === "undefined") {
    canvas.classList.add("hidden");
    emptyMessage.classList.remove("hidden");
    emptyMessage.textContent =
      "グラフを読み込めませんでした。";
    return;
  }

  const selectedDay = graphDateInput.value;
  const firstDay = selectedDay || items[0].date;
  const lastDay = selectedDay || items[items.length - 1].date;

  const startMinute =
    new Date(`${firstDay}T00:00:00`).getTime() / 60000;

  const endMinute =
    new Date(`${lastDay}T00:00:00`).getTime() / 60000 +
    1440;

  moodChart = new Chart(canvas, {
    type: "line",

    data: {
      datasets: [
        {
          label: "気分",

          data: items.map(record => ({
            x: new Date(
              `${record.date}T${getSortableTime(record.time)}:00`
            ).getTime() / 60000,
            y: Number(record.mood)
          })),

          borderColor: "#58a98a",
          backgroundColor: "rgba(88,169,138,0.18)",

          pointBackgroundColor: items.map(record =>
            moodColor(Number(record.mood))
          ),

          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 5,
          borderWidth: 3,
          tension: 0.2,
          fill: false
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      scales: {
        y: {
          min: -3,
          max: 3,
          ticks: {
            stepSize: 1,
            callback(value) {
              return formatMood(Number(value));
            }
          }
        },

        x: {
          type: "linear",
          min: startMinute,
          max: endMinute,

          ticks: {
            maxTicksLimit: 7,
            callback(value) {
              const date =
                new Date(Number(value) * 60000);
              const time =
                `${String(date.getHours()).padStart(2, "0")}:` +
                String(date.getMinutes()).padStart(2, "0");

              return selectedDay
                ? time
                : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
            }
          },

          title: {
            display: true,
            text: selectedDay
              ? formatDate(selectedDay)
              : "日時"
          }
        }
      },

      plugins: {
        tooltip: {
          callbacks: {
            title(context) {
              const record =
                items[context[0].dataIndex];
              return `${formatDate(record.date)} ${record.time}`;
            },
            label(context) {
              return `気分 ${formatMood(context.parsed.y)}`;
            }
          }
        },
        legend: {
          display: true
        }
      }
    }
  });
}

/* =========================
   検索
========================= */

document
  .getElementById("searchButton")
  .addEventListener("click", runSearch);

document
  .getElementById("searchClearButton")
  .addEventListener("click", clearSearch);

document
  .getElementById("searchKeyword")
  .addEventListener("keydown", event => {
    if (event.key === "Enter") runSearch();
  });

function runSearch() {
  const startDate =
    document.getElementById("searchStartDate").value;
  const endDate =
    document.getElementById("searchEndDate").value;

  const keyword = document
    .getElementById("searchKeyword")
    .value.trim()
    .toLocaleLowerCase("ja-JP");

  const moodValue = searchMoodInput.value;
  const searchMessage =
    document.getElementById("searchMessage");

  if (!startDate || !endDate) {
    searchMessage.textContent =
      "開始日と終了日を選択してください。";
    return;
  }

  if (startDate > endDate) {
    searchMessage.textContent =
      "開始日は終了日以前にしてください。";
    return;
  }

  if (!keyword && moodValue === "") {
    searchMessage.textContent =
      "検索ワードまたは気分を指定してください。";
    return;
  }

  searchMessage.textContent = "";

  const results = getSortedRecords().filter(record => {
    const dateMatches =
      record.date >= startDate &&
      record.date <= endDate;

    const keywordMatches =
      !keyword ||
      record.activity
        .toLocaleLowerCase("ja-JP")
        .includes(keyword);

    const moodMatches =
      moodValue === "" ||
      Number(record.mood) === Number(moodValue);

    return dateMatches &&
      keywordMatches &&
      moodMatches;
  });

  renderSearchResults(results);
}

function renderSearchResults(items) {
  const resultsArea =
    document.getElementById("searchResults");

  document.getElementById("searchResultCount").textContent =
    `${items.length}件`;

  if (items.length === 0) {
    resultsArea.innerHTML = `
      <p class="empty-message">
        条件に一致する記録がありません。
      </p>
    `;
    return;
  }

  resultsArea.innerHTML = items.map(record => `
    <article class="search-result-item">
      <div class="record-head">
        <time class="record-date">
          ${formatDate(record.date)}
          ${escapeHtml(record.time)}
        </time>

        <span
          class="mood-badge"
          style="background:${moodColor(Number(record.mood))}"
        >
          気分 ${formatMood(Number(record.mood))}
        </span>
      </div>

      <p class="activity-text">
        ${escapeHtml(record.activity)}
      </p>
    </article>
  `).join("");
}

function clearSearch() {
  document.getElementById("searchStartDate").value = "";
  document.getElementById("searchEndDate").value = "";
  document.getElementById("searchKeyword").value = "";
  searchMoodInput.value = "";
  document.getElementById("searchMessage").textContent = "";
  clearSearchResults();
}

function clearSearchResults() {
  document.getElementById("searchResultCount").textContent =
    "0件";

  document.getElementById("searchResults").innerHTML = `
    <p class="empty-message">
      期間と検索条件を入力してください。
    </p>
  `;
}

/* =========================
   定期的な活動
========================= */

document
  .getElementById("openRoutineButton")
  .addEventListener("click", openRoutineModal);

document
  .getElementById("closeRoutineButton")
  .addEventListener("click", closeRoutineModal);

document
  .getElementById("toggleRoutineSettingsButton")
  .addEventListener("click", () => {
    routineSettingsOpen = !routineSettingsOpen;
    renderRoutineActivities();
  });

document
  .getElementById("addRoutineButton")
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

  const index =
    Number(input.dataset.routineEditIndex);
  const value = input.value.trim();

  if (!value) {
    renderRoutineActivities();
    return;
  }

  routineActivities[index] = value;
  saveJson(ROUTINE_STORAGE_KEY, routineActivities);
  renderRoutineActivities();
});

routineEditList.addEventListener("click", event => {
  const button =
    event.target.closest("[data-routine-delete-index]");
  if (!button) return;

  const index =
    Number(button.dataset.routineDeleteIndex);

  routineActivities.splice(index, 1);
  saveJson(ROUTINE_STORAGE_KEY, routineActivities);
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
  saveJson(ROUTINE_STORAGE_KEY, routineActivities);
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

/* =========================
   日ごとの印刷
========================= */

const printDialog = document.getElementById("printDialog");
const printStartDate = document.getElementById("printStartDate");
const printEndDate = document.getElementById("printEndDate");
const printDialogMessage =
  document.getElementById("printDialogMessage");

document
  .getElementById("openPrintDialogButton")
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

document
  .getElementById("cancelPrintButton")
  .addEventListener("click", closePrintDialog);

printDialog.addEventListener("click", event => {
  if (event.target === printDialog) {
    closePrintDialog();
  }
});

document
  .getElementById("executePrintButton")
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

    document.getElementById("dailyPrintRoot").innerHTML =
      days.map(buildDailyPrintPage).join("");

    closePrintDialog();
    document.body.classList.add("print-daily");

    requestAnimationFrame(() => {
      window.print();
    });
  });

window.addEventListener("afterprint", () => {
  document.body.classList.remove("print-daily");
});

function buildDailyPrintPage(date) {
  const items = getSortedRecords().filter(
    record => record.date === date
  );

  const middle = items.length <= 10
  ? items.length
  : items.length <= 20
    ? 10
    : Math.ceil(items.length / 2);

  const perColumn = Math.max(
    middle,
    items.length - middle
  );

  const recordFont = Math.max(
    5.5,
    Math.min(8, 80 / Math.max(10, perColumn))
  );

  const memo = dailyMemos[date] || "";

  const column = part => part.length
    ? part.map(record => `
        <div class="daily-print-record">
          <div class="daily-print-record-heading">
            <strong>${escapeHtml(record.time)}</strong>
            <span>
              気分 ${formatMood(Number(record.mood))}
            </span>
          </div>
          <p>${escapeHtml(record.activity)}</p>
        </div>
      `).join("")
    : '<p class="daily-print-empty">記録なし</p>';

  return `
    <section
      class="daily-print-page"
      style="--daily-record-font:${recordFont}pt"
    >
      <h1>
        ${escapeHtml(date.replace(/-/g, "/"))}
        活動記録表
      </h1>

      <section class="daily-print-graph">
        <h2>グラフ</h2>
        ${buildDailyGraphSvg(items)}
      </section>

      <div class="daily-print-columns">
        <section class="daily-print-column">
          <div class="daily-print-list">
            ${column(items.slice(0, middle))}
          </div>
        </section>

        <section class="daily-print-column">
          <div class="daily-print-list">
            ${column(items.slice(middle))}
          </div>
        </section>
      </div>

      <section class="daily-print-memo">
        <h2>メモ</h2>
        <p>${memo ? escapeHtml(memo) : "メモなし"}</p>
      </section>
    </section>
  `;
}

function buildDailyGraphSvg(items) {
  const left = 44;
  const right = 716;
  const top = 16;
  const bottom = 177;

  const y = mood =>
    bottom -
    (Number(mood) + 3) *
      (bottom - top) / 6;

  const x = time =>
    left +
    (
      Number(time.slice(0, 2)) * 60 +
      Number(time.slice(3, 5))
    ) *
      (right - left) / 1440;

  const grid =
    [-3, -2, -1, 0, 1, 2, 3]
      .map(value => `
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
          ${value}
        </text>
      `)
      .join("");

  const ticks =
    [0, 6, 12, 18, 24]
      .map(hour => {
        const position =
          left +
          hour * (right - left) / 24;

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
      })
      .join("");

  const points = items
    .map(item =>
      `${x(getSortableTime(item.time))},${y(item.mood)}`
    )
    .join(" ");

  const dots = items
    .map(item => `
      <circle
        cx="${x(getSortableTime(item.time))}"
        cy="${y(item.mood)}"
        r="4"
        fill="${moodColor(Number(item.mood))}"
      />
    `)
    .join("");

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

/* =========================
   下部メニュー
========================= */

document
  .querySelectorAll(".nav-button")
  .forEach(button => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });

function showPage(pageId) {
  if (pageId === "planPage") {
    renderPlanList();
  }

  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle(
      "active",
      page.id === pageId
    );
  });

  document.querySelectorAll(".nav-button").forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.page === pageId
      );
    }
  );

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

/* =========================
   共通処理
========================= */

function getSortedRecords() {
  return [...records].sort((first, second) => {
    const firstValue =
      `${first.date}T${getSortableTime(first.time)}`;
    const secondValue =
      `${second.date}T${getSortableTime(second.time)}`;
    return firstValue.localeCompare(secondValue);
  });
}

function setCurrentDateTime() {
  const now = new Date();

  dateInput.value = formatInputDate(now);
  timeInput.value =
    `${String(now.getHours()).padStart(2, "0")}:` +
    String(now.getMinutes()).padStart(2, "0");
}

function getToday() {
  return formatInputDate(new Date());
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month =
    String(date.getMonth() + 1).padStart(2, "0");
  const day =
    String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeTypedTime(value) {
  const text = String(value)
    .trim()
    .replace(/\s/g, "");

  if (!text) return null;

  let hourText = "";
  let minuteText = "";

  if (text.includes(":")) {
    const parts = text.split(":");
    if (parts.length !== 2) return null;

    hourText = parts[0];
    minuteText = parts[1];
  } else {
    const numbers = text.replace(/\D/g, "");

    if (
      numbers.length === 1 ||
      numbers.length === 2
    ) {
      hourText = numbers;
      minuteText = "00";
    } else if (
      numbers.length === 3 ||
      numbers.length === 4
    ) {
      hourText = numbers.slice(0, -2);
      minuteText = numbers.slice(-2);
    } else {
      return null;
    }
  }

  if (
    !/^\d{1,2}$/.test(hourText) ||
    !/^\d{1,2}$/.test(minuteText)
  ) {
    return null;
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return (
    `${String(hour).padStart(2, "0")}:` +
    String(minute).padStart(2, "0")
  );
}

function getSortableTime(value) {
  return normalizeTypedTime(value) || "00:00";
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatMood(mood) {
  if (mood > 0) return `＋${mood}`;
  return String(mood).replace("-", "−");
}

function moodColor(mood) {
  const colors = [
    "#4267a9",
    "#5d83ba",
    "#7a9cab",
    "#809087",
    "#66a47d",
    "#42a66e",
    "#238d59"
  ];

  return colors[mood + 3] || "#809087";
}

function createRecordId() {
  return (
    Date.now().toString() +
    "-" +
    Math.random().toString(16).slice(2)
  );
}

function loadJson(key, defaultValue) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  } catch (error) {
    console.error(
      `${key}の読み込みに失敗しました。`,
      error
    );
    return defaultValue;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(
      `${key}の保存に失敗しました。`,
      error
    );
    return false;
  }
}

function escapeHtml(value) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  };

  return String(value).replace(
    /[&<>'"]/g,
    character => replacements[character]
  );
}

window.editRecord = editRecord;
window.deleteRecord = deleteRecord;

initializeApp();

function initializeApp() {
  setCurrentDateTime();

  const today = getToday();
  timelineDateInput.value = today;
  graphDateInput.value = today;

  renderTimeline();
  loadDailyMemo(today);
  renderRoutineActivities();
  clearSearchResults();

  requestAnimationFrame(drawGraph);
}