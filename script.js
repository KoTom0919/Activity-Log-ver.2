"use strict";

/* =========================
   基本設定
========================= */

const STORAGE_KEY =
  "activityRecords_v1";

const ROUTINE_STORAGE_KEY =
  "routineActivities_v1";

let records = loadRecords();

let routineActivities =
  loadRoutineActivities();

let selectedMood = null;
let editingId = null;

let timelineFilter = {
  start: "",
  end: ""
};

let activitySearchText = "";
let routineSettingsOpen = false;

let graphFilter = {
  start: "",
  end: ""
};

/* =========================
   HTML要素
========================= */

const dateInput =
  document.getElementById(
    "recordDate"
  );

const timeInput =
  document.getElementById(
    "recordTime"
  );

const activityInput =
  document.getElementById(
    "activity"
  );

const moodButtons = [
  ...document.querySelectorAll(
    "#moodButtons button"
  )
];

const message =
  document.getElementById(
    "formMessage"
  );

const saveButton =
  document.getElementById(
    "saveButton"
  );

const cancelEditButton =
  document.getElementById(
    "cancelEditButton"
  );

const routineModal =
  document.getElementById(
    "routineModal"
  );

const routineList =
  document.getElementById(
    "routineList"
  );

const routineSettings =
  document.getElementById(
    "routineSettings"
  );

const routineEditList =
  document.getElementById(
    "routineEditList"
  );

const newRoutineInput =
  document.getElementById(
    "newRoutineInput"
  );

/* =========================
   初期表示
========================= */

setCurrentDateTime();
renderTimeline();

/* =========================
   ボタン
========================= */

document
  .getElementById("nowButton")
  .addEventListener(
    "click",
    setCurrentDateTime
  );

saveButton.addEventListener(
  "click",
  saveRecord
);

cancelEditButton.addEventListener(
  "click",
  () => resetForm()
);

/* 定期的な活動 */

document
  .getElementById(
    "openRoutineButton"
  )
  .addEventListener(
    "click",
    openRoutineModal
  );

document
  .getElementById(
    "closeRoutineButton"
  )
  .addEventListener(
    "click",
    closeRoutineModal
  );

document
  .getElementById(
    "toggleRoutineSettingsButton"
  )
  .addEventListener(
    "click",
    toggleRoutineSettings
  );

document
  .getElementById(
    "addRoutineButton"
  )
  .addEventListener(
    "click",
    addRoutineActivity
  );

newRoutineInput.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      addRoutineActivity();
    }
  }
);

routineModal.addEventListener(
  "click",
  event => {
    if (event.target === routineModal) {
      closeRoutineModal();
    }
  }
);

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape" &&
      !routineModal.classList.contains(
        "hidden"
      )
    ) {
      closeRoutineModal();
    }
  }
);

routineList.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        "[data-routine-index]"
      );

    if (!button) {
      return;
    }

    const index =
      Number(
        button.dataset.routineIndex
      );

    activityInput.value =
      routineActivities[index] || "";

    closeRoutineModal();
    activityInput.focus();
  }
);

routineEditList.addEventListener(
  "change",
  updateRoutineActivity
);

routineEditList.addEventListener(
  "click",
  deleteRoutineActivity
);

/* 記録削除 */

document
  .getElementById(
    "clearAllButton"
  )
  .addEventListener(
    "click",
    clearAllRecords
  );

/* 日付フィルター */

document
  .getElementById(
    "timelineFilterButton"
  )
  .addEventListener(
    "click",
    applyTimelineFilter
  );

document
  .getElementById(
    "timelineResetButton"
  )
  .addEventListener(
    "click",
    resetTimelineFilter
  );

document
  .getElementById(
    "graphFilterButton"
  )
  .addEventListener(
    "click",
    applyGraphFilter
  );

document
  .getElementById(
    "graphResetButton"
  )
  .addEventListener(
    "click",
    resetGraphFilter
  );

/* 印刷 */

document
  .getElementById(
    "timelinePrintButton"
  )
  .addEventListener(
    "click",
    () => printSelectedPage(
      "timeline"
    )
  );

document
  .getElementById(
    "graphPrintButton"
  )
  .addEventListener(
    "click",
    () => printSelectedPage(
      "graph"
    )
  );

window.addEventListener(
  "afterprint",
  clearPrintMode
);

/* 活動内容検索 */

document
  .getElementById(
    "activitySearchButton"
  )
  .addEventListener(
    "click",
    applyActivitySearch
  );

document
  .getElementById(
    "activitySearchResetButton"
  )
  .addEventListener(
    "click",
    resetActivitySearch
  );

document
  .getElementById(
    "activitySearchInput"
  )
  .addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        applyActivitySearch();
      }
    }
  );

/* 気分ボタン */

moodButtons.forEach(button => {
  button.addEventListener(
    "click",
    () => {
      selectMood(
        Number(
          button.dataset.mood
        )
      );
    }
  );
});

/* 画面切り替え */

document
  .querySelectorAll(
    ".nav-button"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        showPage(
          button.dataset.page
        );
      }
    );
  });

/* 画面幅変更時 */

window.addEventListener(
  "resize",
  debounce(() => {
    const graphPage =
      document.getElementById(
        "graphPage"
      );

    if (
      graphPage.classList.contains(
        "active"
      )
    ) {
      drawGraph();
    }
  }, 150)
);

/* =========================
   記録データの読み込み
========================= */

function loadRecords() {
  try {
    const savedData =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!savedData) {
      return [];
    }

    const parsedData =
      JSON.parse(savedData);

    return Array.isArray(
      parsedData
    )
      ? parsedData
      : [];
  } catch (error) {
    console.error(
      "記録の読み込みに失敗しました。",
      error
    );

    return [];
  }
}

/* =========================
   記録データの保存
========================= */

function persistRecords() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );
  } catch (error) {
    console.error(
      "記録の保存に失敗しました。",
      error
    );

    showMessage(
      "記録を保存できませんでした。"
    );
  }
}

/* =========================
   定期的な活動
========================= */

function loadRoutineActivities() {
  try {
    const savedData =
      localStorage.getItem(
        ROUTINE_STORAGE_KEY
      );

    if (!savedData) {
      return [];
    }

    const parsedData =
      JSON.parse(savedData);

    return Array.isArray(parsedData)
      ? parsedData.filter(item => {
          return (
            typeof item === "string" &&
            item.trim()
          );
        })
      : [];
  } catch (error) {
    console.error(
      "定期的な活動の読み込みに失敗しました。",
      error
    );

    return [];
  }
}

function persistRoutineActivities() {
  try {
    localStorage.setItem(
      ROUTINE_STORAGE_KEY,
      JSON.stringify(
        routineActivities
      )
    );
  } catch (error) {
    console.error(
      "定期的な活動の保存に失敗しました。",
      error
    );
  }
}

function openRoutineModal() {
  routineSettingsOpen = false;

  renderRoutineActivities();

  routineModal.classList.remove(
    "hidden"
  );

  routineModal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "modal-open"
  );

  document
    .getElementById(
      "closeRoutineButton"
    )
    .focus();
}

function closeRoutineModal() {
  routineModal.classList.add(
    "hidden"
  );

  routineModal.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "modal-open"
  );
}

function toggleRoutineSettings() {
  routineSettingsOpen =
    !routineSettingsOpen;

  renderRoutineActivities();

  if (routineSettingsOpen) {
    newRoutineInput.focus();
  }
}

function renderRoutineActivities() {
  if (routineActivities.length > 0) {
    routineList.innerHTML =
      routineActivities
        .map((activity, index) => {
          return `
            <button
              class="routine-choice"
              type="button"
              data-routine-index="${index}"
            >
              ${escapeHtml(activity)}
            </button>
          `;
        })
        .join("");
  } else {
    routineList.innerHTML = `
      <p class="routine-empty">
        設定から、よくする活動を追加してください。
      </p>
    `;
  }

  routineSettings.classList.toggle(
    "hidden",
    !routineSettingsOpen
  );

  document
    .getElementById(
      "toggleRoutineSettingsButton"
    )
    .textContent =
      routineSettingsOpen
        ? "設定を閉じる"
        : "設定";

  routineEditList.innerHTML =
    routineActivities
      .map((activity, index) => {
        return `
          <div class="routine-edit-row">
            <input
              type="text"
              maxlength="100"
              value="${escapeHtml(activity)}"
              data-routine-edit-index="${index}"
              aria-label="定期的な活動を編集"
            >

            <button
              type="button"
              data-routine-delete-index="${index}"
            >
              削除
            </button>
          </div>
        `;
      })
      .join("");
}

function addRoutineActivity() {
  const activity =
    newRoutineInput.value.trim();

  if (!activity) {
    newRoutineInput.focus();
    return;
  }

  routineActivities.push(activity);

  persistRoutineActivities();

  newRoutineInput.value = "";

  renderRoutineActivities();

  newRoutineInput.focus();
}

function updateRoutineActivity(event) {
  const input =
    event.target.closest(
      "[data-routine-edit-index]"
    );

  if (!input) {
    return;
  }

  const index =
    Number(
      input.dataset.routineEditIndex
    );

  const activity =
    input.value.trim();

  if (!activity) {
    renderRoutineActivities();
    return;
  }

  routineActivities[index] =
    activity;

  persistRoutineActivities();
  renderRoutineActivities();
}

function deleteRoutineActivity(event) {
  const button =
    event.target.closest(
      "[data-routine-delete-index]"
    );

  if (!button) {
    return;
  }

  const index =
    Number(
      button.dataset.routineDeleteIndex
    );

  routineActivities.splice(
    index,
    1
  );

  persistRoutineActivities();
  renderRoutineActivities();
}

/* =========================
   活動内容検索
========================= */

function applyActivitySearch() {
  activitySearchText =
    document
      .getElementById(
        "activitySearchInput"
      )
      .value
      .trim();

  renderTimeline();
}

function resetActivitySearch() {
  document.getElementById(
    "activitySearchInput"
  ).value = "";

  activitySearchText = "";

  renderTimeline();
}

/* =========================
   現在日時
========================= */

function getLocalDateAndTime(
  date = new Date()
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  const hours =
    String(
      date.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      date.getMinutes()
    ).padStart(2, "0");

  return {
    date:
      `${year}-${month}-${day}`,

    time:
      `${hours}:${minutes}`
  };
}

function setCurrentDateTime() {
  const current =
    getLocalDateAndTime();

  dateInput.value =
    current.date;

  timeInput.value =
    current.time;
}

/* =========================
   気分の選択
========================= */

function selectMood(mood) {
  selectedMood = mood;

  moodButtons.forEach(button => {
    const buttonMood =
      Number(
        button.dataset.mood
      );

    const isSelected =
      buttonMood === mood;

    button.classList.toggle(
      "selected",
      isSelected
    );

    button.setAttribute(
      "aria-pressed",
      String(isSelected)
    );
  });
}

/* =========================
   記録の保存
========================= */

function saveRecord() {
  const date =
    dateInput.value;

  const time =
    timeInput.value;

  const activity =
    activityInput.value.trim();

  if (!date) {
    showMessage(
      "日付を入力してください。"
    );

    return;
  }

  if (!time) {
    showMessage(
      "時刻を入力してください。"
    );

    return;
  }

  if (!activity) {
    showMessage(
      "活動内容を入力してください。"
    );

    return;
  }

  if (selectedMood === null) {
    showMessage(
      "気分を選択してください。"
    );

    return;
  }

  const wasEditing =
    editingId !== null;

  const record = {
    id:
      editingId ||
      createRecordId(),

    date: date,
    time: time,
    activity: activity,
    mood: selectedMood
  };

  if (wasEditing) {
    records =
      records.map(item => {
        if (
          item.id === editingId
        ) {
          return record;
        }

        return item;
      });
  } else {
    records.push(record);
  }

  persistRecords();
  renderTimeline();
  resetForm(true);

  showMessage(
    wasEditing
      ? "記録を更新しました。"
      : "記録しました。",
    true
  );
}

function createRecordId() {
  return (
    Date.now().toString() +
    "-" +
    Math.random()
      .toString(16)
      .slice(2)
  );
}

/* =========================
   入力欄の初期化
========================= */

function resetForm(
  keepMessage = false
) {
  editingId = null;

  activityInput.value = "";

  selectMood(null);
  setCurrentDateTime();

  saveButton.textContent =
    "記録する";

  cancelEditButton.classList.add(
    "hidden"
  );

  if (!keepMessage) {
    showMessage("");
  }
}

function showMessage(
  text,
  success = false
) {
  message.textContent = text;

  message.classList.toggle(
    "success",
    success
  );
}

/* =========================
   並べ替え
========================= */

function sortedRecords() {
  return [...records].sort(
    (first, second) => {
      const firstDateTime =
        `${first.date}T${first.time}`;

      const secondDateTime =
        `${second.date}T${second.time}`;

      return firstDateTime.localeCompare(
        secondDateTime
      );
    }
  );
}

/* =========================
   日付フィルター
========================= */

function filteredRecords(filter) {
  return sortedRecords().filter(
    record => {
      const afterStart =
        !filter.start ||
        record.date >=
          filter.start;

      const beforeEnd =
        !filter.end ||
        record.date <=
          filter.end;

      return (
        afterStart &&
        beforeEnd
      );
    }
  );
}

function validateDateRange(
  start,
  end,
  messageId
) {
  const filterMessage =
    document.getElementById(
      messageId
    );

  if (
    start &&
    end &&
    start > end
  ) {
    filterMessage.textContent =
      "開始日は終了日以前にしてください。";

    return false;
  }

  filterMessage.textContent = "";

  return true;
}

/* 時系列フィルター */

function applyTimelineFilter() {
  const start =
    document.getElementById(
      "timelineStartDate"
    ).value;

  const end =
    document.getElementById(
      "timelineEndDate"
    ).value;

  if (
    !validateDateRange(
      start,
      end,
      "timelineFilterMessage"
    )
  ) {
    return;
  }

  timelineFilter = {
    start: start,
    end: end
  };

  renderTimeline();
}

function resetTimelineFilter() {
  document.getElementById(
    "timelineStartDate"
  ).value = "";

  document.getElementById(
    "timelineEndDate"
  ).value = "";

  document.getElementById(
    "timelineFilterMessage"
  ).textContent = "";

  timelineFilter = {
    start: "",
    end: ""
  };

  renderTimeline();
}

/* グラフフィルター */

function applyGraphFilter() {
  const start =
    document.getElementById(
      "graphStartDate"
    ).value;

  const end =
    document.getElementById(
      "graphEndDate"
    ).value;

  if (
    !validateDateRange(
      start,
      end,
      "graphFilterMessage"
    )
  ) {
    return;
  }

  graphFilter = {
    start: start,
    end: end
  };

  drawGraph();
}

function resetGraphFilter() {
  document.getElementById(
    "graphStartDate"
  ).value = "";

  document.getElementById(
    "graphEndDate"
  ).value = "";

  document.getElementById(
    "graphFilterMessage"
  ).textContent = "";

  graphFilter = {
    start: "",
    end: ""
  };

  drawGraph();
}

/* =========================
   時系列表示
========================= */

function renderTimeline() {
  const timeline =
    document.getElementById(
      "timeline"
    );

  const recordCount =
    document.getElementById(
      "recordCount"
    );

  const clearAllButton =
    document.getElementById(
      "clearAllButton"
    );

  const searchWord =
    activitySearchText
      .toLocaleLowerCase(
        "ja-JP"
      );

  const items =
    filteredRecords(
      timelineFilter
    ).filter(record => {
      const activityText =
        record.activity
          .toLocaleLowerCase(
            "ja-JP"
          );

      return (
        !searchWord ||
        activityText.includes(
          searchWord
        )
      );
    });

  recordCount.textContent =
    `${items.length}件`;

  clearAllButton.classList.toggle(
    "hidden",
    records.length === 0
  );

  if (items.length === 0) {
    let emptyText =
      "まだ記録がありません。";

    if (records.length > 0) {
      emptyText =
        "条件に一致する記録がありません。";
    }

    timeline.innerHTML = `
      <p class="empty-message">
        ${emptyText}
      </p>
    `;

    return;
  }

  timeline.innerHTML =
    items.map(record => {
      return `
        <article class="timeline-item">
          <div class="record-head">
            <time
              class="record-date"
              datetime="${record.date}T${record.time}"
            >
              ${formatDate(record.date)}
              ${record.time}
            </time>

            <span
              class="mood-badge"
              style="background:${moodColor(record.mood)}"
            >
              気分 ${formatMood(record.mood)}
            </span>
          </div>

          <p class="activity-text">${
            escapeHtml(
              record.activity
            )
          }</p>

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
      `;
    }).join("");
}

/* =========================
   編集
========================= */

function editRecord(id) {
  const record =
    records.find(item => {
      return item.id === id;
    });

  if (!record) {
    return;
  }

  editingId = id;

  dateInput.value =
    record.date;

  timeInput.value =
    record.time;

  activityInput.value =
    record.activity;

  selectMood(record.mood);

  saveButton.textContent =
    "更新する";

  cancelEditButton.classList.remove(
    "hidden"
  );

  showMessage("");
  showPage("inputPage");

  activityInput.focus();
}

/* =========================
   削除
========================= */

function deleteRecord(id) {
  const confirmed =
    window.confirm(
      "この記録を削除しますか？"
    );

  if (!confirmed) {
    return;
  }

  records =
    records.filter(item => {
      return item.id !== id;
    });

  persistRecords();
  renderTimeline();
}

function clearAllRecords() {
  if (records.length === 0) {
    return;
  }

  const confirmed =
    window.confirm(
      "すべての記録を削除します。" +
      "元に戻せません。よろしいですか？"
    );

  if (!confirmed) {
    return;
  }

  records = [];

  persistRecords();
  renderTimeline();
  drawGraph();
}

/* =========================
   画面切り替え
========================= */

function showPage(pageId) {
  document
    .querySelectorAll(".page")
    .forEach(page => {
      page.classList.toggle(
        "active",
        page.id === pageId
      );
    });

  document
    .querySelectorAll(
      ".nav-button"
    )
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page ===
          pageId
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageId === "graphPage") {
    requestAnimationFrame(
      drawGraph
    );
  }
}

/* =========================
   印刷
========================= */

function printSelectedPage(
  pageType
) {
  clearPrintMode();

  if (pageType === "graph") {
    document.body.classList.add(
      "print-graph"
    );

    drawGraph();

    setTimeout(() => {
      window.print();
    }, 150);

    return;
  }

  document.body.classList.add(
    "print-timeline"
  );

  window.print();
}

function clearPrintMode() {
  document.body.classList.remove(
    "print-timeline",
    "print-graph"
  );
}

/* =========================
   グラフ
========================= */

function drawGraph() {
  const canvas =
    document.getElementById(
      "moodChart"
    );

  const emptyMessage =
    document.getElementById(
      "graphEmpty"
    );

  const items =
    filteredRecords(
      graphFilter
    );

  canvas.classList.toggle(
    "hidden",
    items.length === 0
  );

  emptyMessage.classList.toggle(
    "hidden",
    items.length > 0
  );

  emptyMessage.textContent =
    records.length > 0
      ? "指定した期間の記録がありません。"
      : "記録するとグラフが表示されます。";

  if (items.length === 0) {
    return;
  }

  const rectangle =
    canvas.getBoundingClientRect();

  const pixelRatio =
    window.devicePixelRatio || 1;

  const width =
    Math.max(
      rectangle.width,
      300
    );

  const height =
    rectangle.height || 360;

  canvas.width =
    Math.round(
      width * pixelRatio
    );

  canvas.height =
    Math.round(
      height * pixelRatio
    );

  const context =
    canvas.getContext("2d");

  context.scale(
    pixelRatio,
    pixelRatio
  );

  const padding = {
    top: 22,
    right: 18,
    bottom: 68,
    left: 43
  };

  const plotWidth =
    width -
    padding.left -
    padding.right;

  const plotHeight =
    height -
    padding.top -
    padding.bottom;

  const times =
    items.map(record => {
      return new Date(
        `${record.date}T${record.time}:00`
      ).getTime();
    });

  const minimumTime =
    Math.min(...times);

  const maximumTime =
    Math.max(...times);

  const timeRange =
    maximumTime -
    minimumTime;

  function getX(
    time,
    index
  ) {
    if (timeRange > 0) {
      return (
        padding.left +
        (
          (time - minimumTime) /
          timeRange
        ) *
        plotWidth
      );
    }

    return (
      padding.left +
      plotWidth / 2 +
      (
        index -
        (items.length - 1) / 2
      ) *
      10
    );
  }

  function getY(mood) {
    return (
      padding.top +
      (
        (3 - mood) /
        6
      ) *
      plotHeight
    );
  }

  context.font =
    "12px sans-serif";

  context.textAlign =
    "right";

  context.textBaseline =
    "middle";

  for (
    let mood = -3;
    mood <= 3;
    mood++
  ) {
    const y =
      getY(mood);

    context.strokeStyle =
      mood === 0
        ? "#9dada6"
        : "#e2e9e6";

    context.lineWidth =
      mood === 0
        ? 1.5
        : 1;

    context.beginPath();

    context.moveTo(
      padding.left,
      y
    );

    context.lineTo(
      width - padding.right,
      y
    );

    context.stroke();

    context.fillStyle =
      "#627069";

    context.fillText(
      formatMood(mood),
      padding.left - 8,
      y
    );
  }

  if (items.length > 1) {
    context.strokeStyle =
      "#58a98a";

    context.lineWidth = 3;
    context.lineJoin = "round";

    context.beginPath();

    items.forEach(
      (record, index) => {
        const x =
          getX(
            times[index],
            index
          );

        const y =
          getY(record.mood);

        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
    );

    context.stroke();
  }

  items.forEach(
    (record, index) => {
      const x =
        getX(
          times[index],
          index
        );

      const y =
        getY(record.mood);

      context.fillStyle =
        moodColor(
          record.mood
        );

      context.beginPath();

      context.arc(
        x,
        y,
        5,
        0,
        Math.PI * 2
      );

      context.fill();

      context.strokeStyle =
        "white";

      context.lineWidth = 2;
      context.stroke();
    }
  );

  const labelIndexes = [
    ...new Set([
      0,
      Math.floor(
        (items.length - 1) / 2
      ),
      items.length - 1
    ])
  ];

  context.fillStyle =
    "#627069";

  context.textAlign =
    "center";

  context.textBaseline =
    "top";

  labelIndexes.forEach(index => {
    const dateParts =
      items[index].date.split("-");

    const month =
      Number(dateParts[1]);

    const day =
      Number(dateParts[2]);

    const x =
      getX(
        times[index],
        index
      );

    context.fillText(
      `${month}/${day}`,
      x,
      height -
        padding.bottom +
        13
    );

    context.fillText(
      items[index].time,
      x,
      height -
        padding.bottom +
        28
    );
  });
}

/* =========================
   表示形式
========================= */

function formatDate(dateText) {
  const date =
    new Date(
      `${dateText}T00:00:00`
    );

  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }
  ).format(date);
}

function formatMood(mood) {
  if (mood > 0) {
    return `＋${mood}`;
  }

  return String(mood).replace(
    "-",
    "−"
  );
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

  return colors[mood + 3];
}

function escapeHtml(text) {
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  };

  return text.replace(
    /[&<>'"]/g,
    character => {
      return replacements[
        character
      ];
    }
  );
}

function debounce(
  functionToRun,
  delay
) {
  let timer;

  return (...argumentsList) => {
    clearTimeout(timer);

    timer = setTimeout(() => {
      functionToRun(
        ...argumentsList
      );
    }, delay);
  };
}