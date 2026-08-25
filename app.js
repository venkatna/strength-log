(() => {
  "use strict";

  const STORAGE_KEY = "strength-log-data-v1";
  const PIN_KEY = "strength-log-pin-v1";
  const UNLOCK_KEY = "strength-log-unlocked";
  const tabs = [
    { id: "today", label: "Today", icon: "◆" },
    { id: "history", label: "History", icon: "↺" },
    { id: "routines", label: "Routines", icon: "≡" },
    { id: "backup", label: "Backup", icon: "⇩" }
  ];

  const defaultRoutines = [
    {
      id: "upper-a",
      name: "Upper A",
      exercises: [
        "Seated Chest Fly (Pec Dec)",
        "High to Low Lat Pulldown",
        "Incline Chest Press Machine",
        "Cable Lateral Raises",
        "Seated Bicep Curl (Dumbbells)",
        "Rope Pulldowns (Triceps)"
      ]
    },
    {
      id: "lower-a",
      name: "Lower A",
      exercises: [
        "Seated Calf Raises",
        "Seated Leg Curl",
        "Leg Extension",
        "Hack Squat",
        "Glute Bridge Machine",
        "Cable Ab Crunches",
        "Lying Leg Raises"
      ]
    },
    {
      id: "upper-b",
      name: "Upper B",
      exercises: [
        "Lateral Raises",
        "Flat Dumbbell Chest Press",
        "T-Bar Chest Supported Row",
        "Seated Shoulder Press Machine",
        "Lat Pulldowns",
        "Dumbbell Hammer Curl",
        "Rope Overhead Tricep Extension"
      ]
    },
    {
      id: "lower-b",
      name: "Lower B",
      exercises: [
        "Standing Calf Raises",
        "Lying Leg Curls",
        "Romanian Deadlift (Bar/Dumbbells)",
        "Leg Press",
        "Cable Russian Twists"
      ]
    }
  ].map(routine => ({
    ...routine,
    exercises: routine.exercises.map(name => createExercise(name))
  }));

  let data = loadData();
  let view = { tab: "today", expandedHistoryId: null, editingHistoryId: null, editingRoutineId: null };
  let authMode = getPinRecord() ? (sessionStorage.getItem(UNLOCK_KEY) ? null : "unlock") : "setup";
  let toastTimer;

  function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createExercise(name = "New exercise") {
    return {
      id: createId("exercise"),
      name,
      warmupSets: 2,
      workingSets: 1
    };
  }

  function initialData() {
    return {
      version: 1,
      routines: defaultRoutines,
      workouts: [],
      activeWorkout: null
    };
  }

  function loadData() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalizeData(JSON.parse(stored)) : initialData();
    } catch {
      return initialData();
    }
  }

  function normalizeData(value) {
    if (!value || !Array.isArray(value.routines) || !Array.isArray(value.workouts)) {
      throw new Error("Invalid Strength Log backup.");
    }

    return {
      version: 1,
      routines: value.routines.map(routine => ({
        id: routine.id || createId("routine"),
        name: routine.name || "Unnamed routine",
        exercises: Array.isArray(routine.exercises)
          ? routine.exercises.map(exercise => ({
              id: exercise.id || createId("exercise"),
              name: exercise.name || "Unnamed exercise",
              warmupSets: clampSetCount(exercise.warmupSets, 2),
              workingSets: clampWorkingSetCount(exercise.workingSets)
            }))
          : []
      })),
      workouts: value.workouts,
      activeWorkout: value.activeWorkout || null
    };
  }

  function clampSetCount(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(5, parsed)) : fallback;
  }

  function clampWorkingSetCount(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(5, parsed)) : 1;
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getPinRecord() {
    try {
      const value = localStorage.getItem(PIN_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  async function hashPin(pin, salt) {
    const content = new TextEncoder().encode(`${salt}:${pin}`);
    const digest = await crypto.subtle.digest("SHA-256", content);
    return bytesToBase64(new Uint8Array(digest));
  }

  async function createPinRecord(pin) {
    const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, hash: await hashPin(pin, salt) };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value, includeTime = false) {
    const options = includeTime
      ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", year: "numeric" };
    return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
  }

  function roundToNearestFive(value) {
    return Math.round(value / 5) * 5;
  }

  function getPreviousExercise(exerciseId) {
    for (let index = data.workouts.length - 1; index >= 0; index -= 1) {
      const match = data.workouts[index].exercises.find(exercise => exercise.exerciseId === exerciseId);
      if (match) return match;
    }
    return null;
  }

  function getWorkingSets(exercise) {
    return exercise?.sets?.filter(set => set.role === "working") || [];
  }

  function getPrimaryWorkingSet(exercise) {
    return getWorkingSets(exercise).at(-1) || null;
  }

  function suggestedWorkingSet(previousSet) {
    if (!previousSet) {
      return { weight: "", reps: 5 };
    }

    if (previousSet.weight === "" || previousSet.weight == null) {
      return { weight: "", reps: Math.min(8, Math.max(5, Number(previousSet.reps) + 1)) };
    }

    const previousWeight = Number(previousSet.weight);
    const previousReps = Number(previousSet.reps);
    if (previousReps >= 8) {
      return { weight: previousWeight + 5, reps: 5 };
    }
    return { weight: previousWeight, reps: Math.max(5, previousReps + 1) };
  }

  function createWorkoutExercise(exercise) {
    const previous = getPreviousExercise(exercise.id);
    const priorWorking = getPrimaryWorkingSet(previous);
    const target = suggestedWorkingSet(priorWorking);
    const warmupWeight = target.weight === "" ? "" : roundToNearestFive(Number(target.weight) * 0.5);
    const sets = [];

    for (let index = 0; index < exercise.warmupSets; index += 1) {
      sets.push({ id: createId("set"), role: "warmup", weight: warmupWeight, reps: 10, completed: false });
    }
    for (let index = 0; index < exercise.workingSets; index += 1) {
      sets.push({
        id: createId("set"),
        role: "working",
        weight: target.weight,
        reps: target.reps,
        completed: false
      });
    }

    return {
      exerciseId: exercise.id,
      name: exercise.name,
      sets,
      completed: false,
      skipped: false,
      previousWorkingSet: priorWorking
        ? { weight: priorWorking.weight, reps: priorWorking.reps }
        : null
    };
  }

  function recommendedRoutine() {
    if (!data.workouts.length) return data.routines[0];
    const lastRoutineId = data.workouts.at(-1).routineId;
    const lastIndex = data.routines.findIndex(routine => routine.id === lastRoutineId);
    return data.routines[(lastIndex + 1 + data.routines.length) % data.routines.length] || data.routines[0];
  }

  function startWorkout(routineId) {
    const routine = data.routines.find(item => item.id === routineId);
    if (!routine) return;

    data.activeWorkout = {
      id: createId("workout"),
      routineId: routine.id,
      routineName: routine.name,
      startedAt: new Date().toISOString(),
      exercises: routine.exercises.map(createWorkoutExercise)
    };
    saveData();
    render();
  }

  function compareWorkingSet(current, previous) {
    if (!previous || current.reps === "") return null;
    if ((current.weight === "" || current.weight == null) && (previous.weight === "" || previous.weight == null)) {
      const currentReps = Number(current.reps);
      const previousReps = Number(previous.reps);
      if (currentReps > previousReps) return "beat";
      if (currentReps === previousReps) return "matched";
      return "below";
    }
    if (current.weight === "" || previous.weight === "" || current.weight == null || previous.weight == null) {
      return null;
    }

    const currentWeight = Number(current.weight);
    const previousWeight = Number(previous.weight);
    const currentReps = Number(current.reps);
    const previousReps = Number(previous.reps);

    if (currentWeight > previousWeight) return currentReps >= 5 ? "beat" : "below";
    if (currentWeight < previousWeight) return "below";
    if (currentReps > previousReps) return "beat";
    if (currentReps === previousReps) return "matched";
    return "below";
  }

  function updateSet(exerciseId, setId, field, value) {
    const exercise = data.activeWorkout.exercises.find(item => item.exerciseId === exerciseId);
    const set = exercise?.sets.find(item => item.id === setId);
    if (!set) return;

    if (field === "completed") {
      set.completed = !set.completed;
    } else {
      const previousValue = set[field];
      const nextValue = value === "" ? "" : Math.max(0, Number(value));
      set[field] = nextValue;

      if (field === "weight" && set.role === "working") {
        const oldWarmupWeight = previousValue === "" ? "" : roundToNearestFive(Number(previousValue) * 0.5);
        const nextWarmupWeight = nextValue === "" ? "" : roundToNearestFive(Number(nextValue) * 0.5);
        exercise.sets
          .filter(item => item.role === "warmup")
          .forEach(warmupSet => {
            if (warmupSet.weight === "" || Number(warmupSet.weight) === Number(oldWarmupWeight)) {
              warmupSet.weight = nextWarmupWeight;
            }
          });
      }
    }
    exercise.completed = exercise.sets.length > 0 && exercise.sets.every(item => item.completed);
    exercise.skipped = false;
    saveData();
    render();
  }

  function completeExercise(exerciseId) {
    const exercise = data.activeWorkout.exercises.find(item => item.exerciseId === exerciseId);
    if (!exercise) return;
    if (exercise.sets.some(set => set.reps === "")) {
      showToast("Enter reps before completing the exercise.");
      return;
    }
    exercise.sets.forEach(set => { set.completed = true; });
    exercise.completed = true;
    exercise.skipped = false;
    saveData();
    render();
  }

  function skipExercise(exerciseId) {
    const exercise = data.activeWorkout.exercises.find(item => item.exerciseId === exerciseId);
    if (!exercise) return;
    exercise.skipped = !exercise.skipped;
    exercise.completed = false;
    exercise.sets.forEach(set => { set.completed = false; });
    saveData();
    render();
  }

  function finishWorkout() {
    const completedExercises = data.activeWorkout.exercises
      .filter(exercise => exercise.completed)
      .map(exercise => ({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        sets: exercise.sets.map(({ id, role, weight, reps }) => ({ id, role, weight, reps }))
      }));

    if (!completedExercises.length) {
      showToast("Complete at least one exercise before finishing.");
      return;
    }

    data.workouts.push({
      id: data.activeWorkout.id,
      routineId: data.activeWorkout.routineId,
      routineName: data.activeWorkout.routineName,
      startedAt: data.activeWorkout.startedAt,
      completedAt: new Date().toISOString(),
      exercises: completedExercises
    });
    data.activeWorkout = null;
    saveData();
    view.tab = "history";
    showToast("Workout saved.");
    render();
  }

  function cancelWorkout() {
    if (!window.confirm("Discard this active workout?")) return;
    data.activeWorkout = null;
    saveData();
    render();
  }

  function renderTopbar(title, subtitle = "") {
    return `
      <header class="topbar">
        <div>
          ${subtitle ? `<p class="eyebrow">${escapeHtml(subtitle)}</p>` : ""}
          <h1>${escapeHtml(title)}</h1>
        </div>
        ${getPinRecord() ? '<button class="icon-button" aria-label="Lock app" data-action="lock">⌾</button>' : ""}
      </header>
    `;
  }

  function renderPinGate() {
    const changing = authMode === "change";
    const creating = authMode === "setup" || changing;
    const title = changing ? "Change PIN" : creating ? "Protect Strength Log" : "Unlock Strength Log";
    const action = creating ? "Save PIN" : "Unlock";

    return `
      <main class="app-shell auth-shell">
        <section class="card auth-card">
          <p class="eyebrow">${creating ? "Device protection" : "Welcome back"}</p>
          <h1>${title}</h1>
          <p class="muted">
            ${creating
              ? "Choose a 4–8 digit PIN. It protects this browser’s workout data from casual access."
              : "Enter your PIN to access the workout data stored on this device."}
          </p>
          <form class="stack" data-pin-form>
            <label class="field">
              <span class="field-label">${creating ? "New PIN" : "PIN"}</span>
              <input class="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*"
                minlength="4" maxlength="8" autocomplete="${creating ? "new-password" : "current-password"}" required autofocus>
            </label>
            ${creating ? `
              <label class="field">
                <span class="field-label">Confirm PIN</span>
                <input class="pin-input" name="confirmation" type="password" inputmode="numeric" pattern="[0-9]*"
                  minlength="4" maxlength="8" autocomplete="new-password" required>
              </label>
            ` : ""}
            <button class="primary full" type="submit">${action}</button>
            ${changing ? '<button class="secondary full" type="button" data-action="cancel-pin-change">Cancel</button>' : ""}
          </form>
          <p class="install-note muted pin-warning">
            This is a local app lock, not website access control. Other people can still load the public site and create their own separate PIN.
          </p>
        </section>
      </main>
    `;
  }

  function renderTabs() {
    if (data.activeWorkout) return "";
    return `
      <nav class="tabs" aria-label="Main navigation">
        ${tabs.map(tab => `
          <button class="tab-button ${view.tab === tab.id ? "active" : ""}" data-action="tab" data-tab="${tab.id}">
            <span aria-hidden="true">${tab.icon}</span>
            ${tab.label}
          </button>
        `).join("")}
      </nav>
    `;
  }

  function renderToday() {
    const recommended = recommendedRoutine();
    const lastWorkout = data.workouts.at(-1);
    return `
      ${renderTopbar("Strength Log", "Progressive overload")}
      <section class="card hero">
        <p class="eyebrow">Up next</p>
        <h2>${escapeHtml(recommended?.name || "No routine")}</h2>
        <p class="muted">
          ${lastWorkout
            ? `Last workout: ${escapeHtml(lastWorkout.routineName)} on ${formatDate(lastWorkout.completedAt)}`
            : "Start with your first routine. Cardio and rest days do not change the rotation."}
        </p>
        <button class="primary full" data-action="start" data-routine-id="${recommended?.id || ""}" ${recommended ? "" : "disabled"}>
          Start ${escapeHtml(recommended?.name || "workout")}
        </button>
      </section>
      <h2>Choose another routine</h2>
      <div class="routine-grid">
        ${data.routines.map(routine => `
          <button class="routine-choice ${routine.id === recommended?.id ? "recommended" : ""}" data-action="start" data-routine-id="${routine.id}">
            <div class="row-between">
              <strong>${escapeHtml(routine.name)}</strong>
              ${routine.id === recommended?.id ? '<span class="badge">Recommended</span>' : ""}
            </div>
            <span class="muted">${routine.exercises.length} exercises</span>
          </button>
        `).join("")}
      </div>
      <section class="card install-note">
        <strong>iPhone installation</strong>
        <p class="muted">Open the hosted app in Safari, tap Share, then “Add to Home Screen.” After the first load it works offline.</p>
      </section>
    `;
  }

  function previousSetText(previous) {
    if (!previous) return "No previous working set. Enter your starting weight.";
    const weight = previous.weight === "" ? "Bodyweight" : `${previous.weight} lb total`;
    return `Previous working set: ${weight} × ${previous.reps} reps`;
  }

  function renderExercise(exercise, index) {
    const currentWorking = getPrimaryWorkingSet(exercise);
    const comparison = currentWorking
      ? compareWorkingSet(currentWorking, exercise.previousWorkingSet)
      : null;
    const comparisonText = {
      beat: "You are beating the previous working set.",
      matched: "This matches the previous working set.",
      below: "This is below the previous working set."
    };

    return `
      <section class="card exercise-card ${exercise.completed ? "completed" : ""} ${exercise.skipped ? "skipped" : ""}">
        <div class="row">
          <div class="exercise-number">${index + 1}</div>
          <div class="grow">
            <h3>${escapeHtml(exercise.name)}</h3>
            <span class="muted">Weight entries are total weight</span>
          </div>
          ${exercise.completed ? '<span class="badge">Done</span>' : ""}
          ${exercise.skipped ? '<span class="badge">Skipped</span>' : ""}
        </div>
        <div class="previous">${previousSetText(exercise.previousWorkingSet)}</div>
        ${exercise.sets.map((set, setIndex) => `
          <div class="set-row">
            <div class="set-role" title="${set.role}">${set.role === "warmup" ? `W${setIndex + 1}` : "WORK"}</div>
            <label class="field">
              <span class="field-label">Total lb (blank = bodyweight)</span>
              <input type="number" inputmode="decimal" min="0" step="1" value="${escapeHtml(set.weight)}"
                data-action="set-value" data-exercise-id="${exercise.exerciseId}" data-set-id="${set.id}" data-field="weight"
                ${exercise.skipped ? "disabled" : ""}>
            </label>
            <label class="field">
              <span class="field-label">Reps</span>
              <input type="number" inputmode="numeric" min="0" step="1" value="${escapeHtml(set.reps)}"
                data-action="set-value" data-exercise-id="${exercise.exerciseId}" data-set-id="${set.id}" data-field="reps"
                ${exercise.skipped ? "disabled" : ""}>
            </label>
            <button class="check-button ${set.completed ? "checked" : ""}" aria-label="Mark set complete"
              data-action="toggle-set" data-exercise-id="${exercise.exerciseId}" data-set-id="${set.id}"
              ${exercise.skipped ? "disabled" : ""}>✓</button>
          </div>
        `).join("")}
        ${comparison ? `<p class="comparison ${comparison}">${comparisonText[comparison]}</p>` : ""}
        <div class="exercise-actions">
          <button class="secondary" data-action="skip-exercise" data-exercise-id="${exercise.exerciseId}">
            ${exercise.skipped ? "Undo skip" : "Skip"}
          </button>
          <button class="primary" data-action="complete-exercise" data-exercise-id="${exercise.exerciseId}" ${exercise.skipped ? "disabled" : ""}>
            Complete exercise
          </button>
        </div>
      </section>
    `;
  }

  function renderActiveWorkout() {
    const workout = data.activeWorkout;
    const completed = workout.exercises.filter(exercise => exercise.completed).length;
    return `
      ${renderTopbar(workout.routineName, `${completed} of ${workout.exercises.length} exercises complete`)}
      <section class="card">
        <strong>Protocol</strong>
        <p class="muted">2 warmups × 10 reps at about 50%, then 1 working set × 5–8 reps near failure. Beat the last working set.</p>
      </section>
      ${workout.exercises.map(renderExercise).join("")}
      <div class="session-footer">
        <div class="two-columns">
          <button class="danger" data-action="cancel-workout">Discard</button>
          <button class="primary" data-action="finish-workout">Finish workout</button>
        </div>
      </div>
    `;
  }

  function renderHistorySet(set, workoutId, exerciseId, editing) {
    const weightText = set.weight === "" ? "Bodyweight" : `${set.weight} lb total`;
    if (!editing) {
      return `
        <div class="history-set">
          <span class="set-label">${set.role === "warmup" ? "Warmup" : "Working"}</span>
          <span>${weightText}</span>
          <span>${set.reps} reps</span>
        </div>
      `;
    }

    return `
      <div class="history-set">
        <span class="set-label">${set.role === "warmup" ? "Warmup" : "Working"}</span>
        <input aria-label="Total weight" type="number" inputmode="decimal" min="0" value="${escapeHtml(set.weight)}"
          data-action="history-set" data-workout-id="${workoutId}" data-exercise-id="${exerciseId}" data-set-id="${set.id}" data-field="weight">
        <input aria-label="Reps" type="number" inputmode="numeric" min="0" value="${escapeHtml(set.reps)}"
          data-action="history-set" data-workout-id="${workoutId}" data-exercise-id="${exerciseId}" data-set-id="${set.id}" data-field="reps">
      </div>
    `;
  }

  function renderHistory() {
    const workouts = [...data.workouts].reverse();
    return `
      ${renderTopbar("History", `${data.workouts.length} saved workout${data.workouts.length === 1 ? "" : "s"}`)}
      ${workouts.length ? workouts.map(workout => {
        const expanded = view.expandedHistoryId === workout.id;
        const editing = view.editingHistoryId === workout.id;
        return `
          <section class="card history-card">
            <button class="row-between full" data-action="expand-history" data-workout-id="${workout.id}">
              <div>
                <h3>${escapeHtml(workout.routineName)}</h3>
                <span class="muted">${formatDate(workout.completedAt, true)} · ${workout.exercises.length} exercises</span>
              </div>
              <span>${expanded ? "▲" : "▼"}</span>
            </button>
            ${expanded ? `
              <div class="history-details">
                ${workout.exercises.map(exercise => `
                  <div class="history-exercise">
                    <strong>${escapeHtml(exercise.name)}</strong>
                    ${exercise.sets.map(set => renderHistorySet(set, workout.id, exercise.exerciseId, editing)).join("")}
                  </div>
                `).join("")}
                <div class="two-columns">
                  <button class="${editing ? "primary" : "secondary"}" data-action="edit-history" data-workout-id="${workout.id}">
                    ${editing ? "Done editing" : "Edit"}
                  </button>
                  <button class="danger" data-action="delete-history" data-workout-id="${workout.id}">Delete</button>
                </div>
              </div>
            ` : ""}
          </section>
        `;
      }).join("") : '<div class="card empty">Your completed workouts will appear here.</div>'}
    `;
  }

  function renderRoutineEditor(routine) {
    return `
      <section class="card">
        <label class="field">
          <span class="field-label">Routine name</span>
          <input value="${escapeHtml(routine.name)}" data-action="routine-name" data-routine-id="${routine.id}">
        </label>
        <div class="stack" style="margin-top: 14px">
          ${routine.exercises.map((exercise, index) => `
            <div class="editor-item">
              <label class="field">
                <span class="field-label">Exercise ${index + 1}</span>
                <input value="${escapeHtml(exercise.name)}" data-action="exercise-name"
                  data-routine-id="${routine.id}" data-exercise-id="${exercise.id}">
              </label>
              <div class="two-columns" style="margin-top: 10px">
                <label class="field">
                  <span class="field-label">Warmup sets</span>
                  <select data-action="exercise-plan" data-field="warmupSets" data-routine-id="${routine.id}" data-exercise-id="${exercise.id}">
                    ${[0, 1, 2, 3, 4, 5].map(value => `<option ${value === exercise.warmupSets ? "selected" : ""}>${value}</option>`).join("")}
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">Working sets</span>
                  <select data-action="exercise-plan" data-field="workingSets" data-routine-id="${routine.id}" data-exercise-id="${exercise.id}">
                    ${[1, 2, 3, 4, 5].map(value => `<option ${value === exercise.workingSets ? "selected" : ""}>${value}</option>`).join("")}
                  </select>
                </label>
              </div>
              <div class="editor-controls">
                <button class="icon-button" aria-label="Move exercise up" data-action="move-exercise" data-direction="-1"
                  data-routine-id="${routine.id}" data-exercise-id="${exercise.id}" ${index === 0 ? "disabled" : ""}>↑</button>
                <button class="icon-button" aria-label="Move exercise down" data-action="move-exercise" data-direction="1"
                  data-routine-id="${routine.id}" data-exercise-id="${exercise.id}" ${index === routine.exercises.length - 1 ? "disabled" : ""}>↓</button>
                <button class="icon-button" aria-label="Delete exercise" data-action="delete-exercise"
                  data-routine-id="${routine.id}" data-exercise-id="${exercise.id}">×</button>
              </div>
            </div>
          `).join("")}
        </div>
        <button class="secondary full" style="margin-top: 14px" data-action="add-exercise" data-routine-id="${routine.id}">Add exercise</button>
      </section>
    `;
  }

  function renderRoutines() {
    return `
      ${renderTopbar("Routines", "Changes affect future workouts")}
      <div class="stack">
        ${data.routines.map(routine => `
          <button class="routine-choice ${view.editingRoutineId === routine.id ? "recommended" : ""}"
            data-action="edit-routine" data-routine-id="${routine.id}">
            <div class="row-between">
              <strong>${escapeHtml(routine.name)}</strong>
              <span>${view.editingRoutineId === routine.id ? "▲" : "▼"}</span>
            </div>
            <span class="muted">${routine.exercises.length} exercises</span>
          </button>
          ${view.editingRoutineId === routine.id ? renderRoutineEditor(routine) : ""}
        `).join("")}
      </div>
    `;
  }

  function renderBackup() {
    return `
      ${renderTopbar("Backup", "Your data stays on this device")}
      <section class="card">
        <h2>Export backup</h2>
        <p class="muted">Download one JSON file containing routines, workout history, and any active workout. Save it to Files, iCloud Drive, or OneDrive.</p>
        <button class="primary full" data-action="export">Export Strength Log data</button>
      </section>
      <section class="card">
        <h2>Restore backup</h2>
        <p class="muted">Restoring replaces all current data on this device.</p>
        <label class="secondary full row" for="import-file">
          Choose backup file
          <input id="import-file" type="file" accept="application/json,.json" data-action="import" hidden>
        </label>
      </section>
      <section class="card">
        <h2>App lock</h2>
        <p class="muted">Change or remove the PIN stored on this device.</p>
        <div class="two-columns">
          <button class="secondary" data-action="change-pin">Change PIN</button>
          <button class="danger" data-action="remove-pin">Remove PIN</button>
        </div>
      </section>
      <section class="card install-note">
        <strong>Storage note</strong>
        <p class="muted">Safari can remove website data in some circumstances. Export a backup periodically until cloud sync is added.</p>
      </section>
    `;
  }

  function render() {
    if (authMode) {
      document.querySelector("#app").innerHTML = renderPinGate();
      return;
    }

    const content = data.activeWorkout
      ? renderActiveWorkout()
      : {
          today: renderToday,
          history: renderHistory,
          routines: renderRoutines,
          backup: renderBackup
        }[view.tab]();

    document.querySelector("#app").innerHTML = `
      <main class="app-shell">${content}</main>
      ${renderTabs()}
    `;
  }

  function showToast(message) {
    document.querySelector(".toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.append(toast);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 2600);
  }

  function getRoutine(routineId) {
    return data.routines.find(routine => routine.id === routineId);
  }

  function getRoutineExercise(routineId, exerciseId) {
    return getRoutine(routineId)?.exercises.find(exercise => exercise.id === exerciseId);
  }

  function handleRoutineChange(target) {
    const routine = getRoutine(target.dataset.routineId);
    if (!routine) return;

    if (target.dataset.action === "routine-name") {
      routine.name = target.value.trim() || "Unnamed routine";
    } else {
      const exercise = getRoutineExercise(target.dataset.routineId, target.dataset.exerciseId);
      if (!exercise) return;
      if (target.dataset.action === "exercise-name") {
        exercise.name = target.value.trim() || "Unnamed exercise";
      } else {
        exercise[target.dataset.field] = target.dataset.field === "workingSets"
          ? clampWorkingSetCount(target.value)
          : clampSetCount(target.value, exercise[target.dataset.field]);
      }
    }
    saveData();
  }

  function updateHistorySet(target) {
    const workout = data.workouts.find(item => item.id === target.dataset.workoutId);
    const exercise = workout?.exercises.find(item => item.exerciseId === target.dataset.exerciseId);
    const set = exercise?.sets.find(item => item.id === target.dataset.setId);
    if (!set) return;
    set[target.dataset.field] = target.value === "" ? "" : Math.max(0, Number(target.value));
    saveData();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `strength-log-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    try {
      const restored = normalizeData(JSON.parse(await file.text()));
      if (!window.confirm("Replace all current Strength Log data with this backup?")) return;
      data = restored;
      saveData();
      view = { tab: "today", expandedHistoryId: null, editingHistoryId: null, editingRoutineId: null };
      render();
      showToast("Backup restored.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not restore this backup.");
    }
  }

  document.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "tab") {
      view.tab = target.dataset.tab;
      render();
    } else if (action === "lock") {
      sessionStorage.removeItem(UNLOCK_KEY);
      authMode = "unlock";
      render();
    } else if (action === "change-pin") {
      authMode = "change";
      render();
    } else if (action === "cancel-pin-change") {
      authMode = null;
      render();
    } else if (action === "remove-pin") {
      if (!window.confirm("Remove the PIN from this device?")) return;
      localStorage.removeItem(PIN_KEY);
      sessionStorage.removeItem(UNLOCK_KEY);
      showToast("PIN removed.");
      render();
    } else if (action === "start") {
      startWorkout(target.dataset.routineId);
    } else if (action === "toggle-set") {
      updateSet(target.dataset.exerciseId, target.dataset.setId, "completed");
    } else if (action === "complete-exercise") {
      completeExercise(target.dataset.exerciseId);
    } else if (action === "skip-exercise") {
      skipExercise(target.dataset.exerciseId);
    } else if (action === "finish-workout") {
      finishWorkout();
    } else if (action === "cancel-workout") {
      cancelWorkout();
    } else if (action === "expand-history") {
      view.expandedHistoryId = view.expandedHistoryId === target.dataset.workoutId ? null : target.dataset.workoutId;
      render();
    } else if (action === "edit-history") {
      view.editingHistoryId = view.editingHistoryId === target.dataset.workoutId ? null : target.dataset.workoutId;
      render();
    } else if (action === "delete-history") {
      if (!window.confirm("Delete this completed workout?")) return;
      data.workouts = data.workouts.filter(workout => workout.id !== target.dataset.workoutId);
      view.expandedHistoryId = null;
      view.editingHistoryId = null;
      saveData();
      render();
    } else if (action === "edit-routine") {
      view.editingRoutineId = view.editingRoutineId === target.dataset.routineId ? null : target.dataset.routineId;
      render();
    } else if (action === "add-exercise") {
      getRoutine(target.dataset.routineId)?.exercises.push(createExercise());
      saveData();
      render();
    } else if (action === "delete-exercise") {
      const routine = getRoutine(target.dataset.routineId);
      if (!routine || !window.confirm("Remove this exercise from future workouts? Its history will be preserved.")) return;
      routine.exercises = routine.exercises.filter(exercise => exercise.id !== target.dataset.exerciseId);
      saveData();
      render();
    } else if (action === "move-exercise") {
      const routine = getRoutine(target.dataset.routineId);
      const index = routine?.exercises.findIndex(exercise => exercise.id === target.dataset.exerciseId) ?? -1;
      const nextIndex = index + Number(target.dataset.direction);
      if (!routine || index < 0 || nextIndex < 0 || nextIndex >= routine.exercises.length) return;
      [routine.exercises[index], routine.exercises[nextIndex]] = [routine.exercises[nextIndex], routine.exercises[index]];
      saveData();
      render();
    } else if (action === "export") {
      exportData();
    }
  });

  document.addEventListener("change", event => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "set-value") {
      updateSet(target.dataset.exerciseId, target.dataset.setId, target.dataset.field, target.value);
    } else if (action === "routine-name" || action === "exercise-name" || action === "exercise-plan") {
      handleRoutineChange(target);
      if (action !== "exercise-plan") return;
      render();
    } else if (action === "history-set") {
      updateHistorySet(target);
    } else if (action === "import" && target.files?.[0]) {
      importData(target.files[0]);
    }
  });

  document.addEventListener("submit", async event => {
    const form = event.target.closest("[data-pin-form]");
    if (!form) return;
    event.preventDefault();

    const formData = new FormData(form);
    const pin = String(formData.get("pin") || "");
    if (!/^\d{4,8}$/.test(pin)) {
      showToast("Use a 4–8 digit PIN.");
      return;
    }

    if (authMode === "unlock") {
      const record = getPinRecord();
      if (!record || await hashPin(pin, record.salt) !== record.hash) {
        showToast("Incorrect PIN.");
        form.reset();
        return;
      }
    } else {
      if (pin !== String(formData.get("confirmation") || "")) {
        showToast("PINs do not match.");
        return;
      }
      localStorage.setItem(PIN_KEY, JSON.stringify(await createPinRecord(pin)));
    }

    sessionStorage.setItem(UNLOCK_KEY, "true");
    authMode = null;
    render();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
  }

  render();
})();
