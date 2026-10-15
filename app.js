(() => {
  "use strict";

  const STORAGE_KEYS = {
    options: "roulette.options.v1",
    presets: "roulette.presets.v1",
  };
  const MAX_ITEMS = 50;
  const MAX_PRESETS = 20;
  const TAU = Math.PI * 2;
  const COLORS = [
    "#FFD6E0", "#FFE1CC", "#FFF4C2", "#D7F0E1",
    "#D6EAF8", "#E6D6F7", "#F0D6FA", "#D2F4F1",
    "#E2EBCB", "#FFF0D6", "#F7D6D6", "#E6E6ED",
  ];

  const elements = {
    canvas: document.querySelector("#roulette-canvas"),
    optionsList: document.querySelector("#options-list"),
    addOption: document.querySelector("#add-option"),
    count: document.querySelector("#item-count"),
    hint: document.querySelector("#input-hint"),
    preview: document.querySelector("#options-preview"),
    emptyWheel: document.querySelector("#wheel-empty"),
    spin: document.querySelector("#spin-button"),
    spinLabel: document.querySelector("#spin-label"),
    spinStatus: document.querySelector("#spin-status"),
    clear: document.querySelector("#clear-options"),
    savePreset: document.querySelector("#save-preset"),
    resultCard: document.querySelector("#result-card"),
    resultTitle: document.querySelector("#result-title"),
    resultMessage: document.querySelector("#result-message"),
    editOptions: document.querySelector("#edit-options"),
    spinAgain: document.querySelector("#spin-again"),
    toast: document.querySelector("#toast"),
    presetDialog: document.querySelector("#preset-dialog"),
    saveDialog: document.querySelector("#save-dialog"),
    openPresets: document.querySelector("#open-presets"),
    closePresets: document.querySelector("#close-presets"),
    closeSave: document.querySelector("#close-save"),
    cancelSave: document.querySelector("#cancel-save"),
    presetList: document.querySelector("#preset-list"),
    emptyPresets: document.querySelector("#empty-presets"),
    saveForm: document.querySelector("#save-form"),
    presetName: document.querySelector("#preset-name"),
    saveError: document.querySelector("#save-error"),
  };
  const context = elements.canvas.getContext("2d");
  const state = {
    items: [],
    presets: [],
    currentRotation: 0,
    isSpinning: false,
    lastResult: null,
    resultItemId: null,
    highlightStartedAt: 0,
    toastTimer: null,
  };

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      showToast("저장된 데이터를 읽지 못했어요. 새로 시작합니다.");
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      showToast("브라우저 저장 공간을 사용할 수 없어요.");
      return false;
    }
  }

  function createOption(label = "", weight = 1, color = COLORS[0], id = createId()) {
    return { id, label, weight: Math.max(0.1, Math.min(100, Number(weight) || 1)), color: COLORS.includes(color) ? color : COLORS[0] };
  }

  function sanitizeStoredOptions(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map((item, index) => {
      const label = typeof item === "string" ? item.trim() : typeof item?.label === "string" ? item.label.trim() : "";
      if (!label || seen.has(label)) return null;
      seen.add(label);
      return createOption(label, item?.weight, item?.color || COLORS[index % COLORS.length], item?.id || createId());
    }).filter(Boolean).slice(0, MAX_ITEMS);
  }

  function syncOptions() {
    renderOptions();
    safeWrite(STORAGE_KEYS.options, sanitizeStoredOptions(state.items));
    drawWheel();
  }

  function renderOptions() {
    const rowCount = state.items.length;
    const usableItems = state.items.filter((item) => item.label.trim());
    const usableCount = usableItems.length;
    elements.count.textContent = `${usableCount} / ${MAX_ITEMS}`;
    elements.count.setAttribute("aria-label", `입력된 선택지 ${usableCount}개`);
    elements.optionsList.replaceChildren();
    const totalWeight = state.items.reduce((sum, item) => sum + item.weight, 0);
    state.items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "option-row";
      row.dataset.id = item.id;
      const number = document.createElement("span");
      number.className = "option-number";
      number.textContent = `${index + 1}.`;
      const label = document.createElement("input");
      label.type = "text"; label.value = item.label; label.maxLength = 80;
      label.placeholder = "선택지 입력"; label.setAttribute("aria-label", `${index + 1}번 선택지`);
      label.addEventListener("input", () => updateOption(item.id, { label: label.value }));
      const weightControl = document.createElement("label");
      weightControl.className = "weight-control";
      weightControl.title = `확률 ${Math.round(item.weight / totalWeight * 100)}%`;
      const weight = document.createElement("input");
      weight.type = "number"; weight.min = "0.1"; weight.max = "100"; weight.step = "0.1"; weight.value = item.weight;
      weight.setAttribute("aria-label", `${index + 1}번 가중치`);
      weight.addEventListener("input", () => updateOption(item.id, { weight: weight.value }));
      const percent = document.createElement("span");
      percent.textContent = `${Math.round(item.weight / totalWeight * 100)}%`;
      weightControl.append(weight, percent);
      const colorLabel = document.createElement("label");
      colorLabel.className = "color-picker";
      colorLabel.style.backgroundColor = item.color;
      colorLabel.title = "색상 선택";
      const color = document.createElement("input");
      color.type = "color"; color.value = item.color; color.setAttribute("aria-label", `${index + 1}번 색상`);
      color.addEventListener("input", () => updateOption(item.id, { color: color.value }, colorLabel));
      colorLabel.append(color);
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "delete-option"; remove.textContent = "×";
      remove.setAttribute("aria-label", `${index + 1}번 선택지 삭제`);
      remove.disabled = rowCount <= 2 || state.isSpinning;
      remove.addEventListener("click", () => removeOption(item.id));
      row.append(number, label, weightControl, colorLabel, remove);
      elements.optionsList.append(row);
    });
    elements.spin.disabled = usableCount < 2 || state.isSpinning;
    elements.savePreset.disabled = usableCount < 1 || state.isSpinning;
    elements.clear.disabled = usableCount === 0 && rowCount === 0 || state.isSpinning;
    elements.addOption.disabled = rowCount >= MAX_ITEMS || state.isSpinning;
    elements.emptyWheel.hidden = usableCount > 0;
    if (!state.isSpinning) {
      if (usableCount < 2) {
        elements.hint.textContent = usableCount === 0 ? "두 칸에 선택지를 입력해 주세요." : "한 가지 선택지가 더 필요해요.";
      } else if (!elements.hint.classList.contains("error")) {
        elements.hint.textContent = "룰렛을 돌릴 수 있어요.";
      }

    }
  }

  function updateOption(id, patch, colorLabel) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    Object.assign(item, patch);
    if ("label" in patch) item.label = String(patch.label).trimStart();
    if ("weight" in patch) item.weight = Math.max(0.1, Math.min(100, Number(patch.weight) || 0.1));
    if (colorLabel) colorLabel.style.backgroundColor = item.color;
    safeWrite(STORAGE_KEYS.options, sanitizeStoredOptions(state.items));
    drawWheel();
    const totalWeight = state.items.reduce((sum, entry) => sum + entry.weight, 0);
    const row = elements.optionsList.querySelector(`[data-id="${id}"]`);
    const percent = row?.querySelector(".weight-control span");
    if (percent) percent.textContent = `${Math.round(item.weight / totalWeight * 100)}%`;
    const usableCount = state.items.filter((entry) => entry.label.trim()).length;
    elements.count.textContent = `${usableCount} / ${MAX_ITEMS}`;
    elements.count.setAttribute("aria-label", `입력된 선택지 ${usableCount}개`);
    elements.spin.disabled = usableCount < 2 || state.isSpinning;
    elements.savePreset.disabled = usableCount < 1 || state.isSpinning;
    elements.emptyWheel.hidden = usableCount > 0;
    if (!state.isSpinning) {
      elements.hint.textContent = usableCount < 2
        ? (usableCount === 0 ? "두 칸에 선택지를 입력해 주세요." : "한 가지 선택지가 더 필요해요.")
        : "룰렛을 돌릴 수 있어요.";
    }
  }

  function removeOption(id) {
    if (state.items.length <= 2 || state.isSpinning) return;
    state.items = state.items.filter((item) => item.id !== id);
    syncOptions();
  }

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const size = elements.canvas.getBoundingClientRect().width;
    if (!size) return;
    elements.canvas.width = Math.floor(size * ratio);
    elements.canvas.height = Math.floor(size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawWheel();
  }

  function drawWheel() {
    const size = elements.canvas.getBoundingClientRect().width;
    if (!size) return;
    const center = size / 2;
    const radius = center - 8;
    context.clearRect(0, 0, size, size);
    const items = state.items.filter((item) => item.label.trim());
    if (!items.length) return;
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let angleOffset = 0;
    context.save();
    context.translate(center, center);
    context.rotate(state.currentRotation);
    items.forEach((item) => {
      const slice = TAU * item.weight / totalWeight;
      const start = -Math.PI / 2 + angleOffset;
      const end = start + slice;
      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, radius, start, end);
      context.closePath();
      context.fillStyle = item.color;
      context.fill();
      context.strokeStyle = "rgba(255,255,255,.8)";
      context.lineWidth = Math.max(2, size / 170);
      context.stroke();
      drawLabel(item, start + slice / 2, radius, size);
      if (item.id === state.resultItemId) {
        drawResultHighlight(start, end, radius, size);
      }
      angleOffset += slice;
    });
    context.restore();
    context.beginPath();
    context.arc(center, center, radius, 0, TAU);
    context.strokeStyle = "rgba(255,255,255,.9)";
    context.lineWidth = Math.max(4, size / 45);
    context.stroke();
    context.beginPath();
    context.arc(center, center, Math.max(22, size / 13), 0, TAU);
    context.fillStyle = "#FFD6E0";
    context.shadowColor = "rgba(119,92,81,.18)";
    context.shadowBlur = 10;
    context.shadowOffsetY = 4;
    context.fill();
    context.shadowColor = "transparent";
    context.fillStyle = "#b9818c";
    context.font = `700 ${Math.max(13, size / 25)}px Trebuchet MS, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("✦", center, center);
  }

  function drawResultHighlight(start, end, radius, size) {
    const elapsed = Math.max(0, performance.now() - state.highlightStartedAt);
    const pulse = elapsed < 1100 ? (1 + Math.sin(elapsed / 1000 * Math.PI * 4)) / 2 : 0;
    const lineWidth = Math.max(4, size / 45) + pulse * Math.max(3, size / 65);
    context.save();
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius - lineWidth / 2, start, end);
    context.closePath();
    context.strokeStyle = `rgba(255, 255, 255, ${0.82 + pulse * 0.18})`;
    context.lineWidth = lineWidth;
    context.shadowColor = `rgba(139, 111, 97, ${0.3 + pulse * 0.45})`;
    context.shadowBlur = 7 + pulse * 12;
    context.stroke();
    context.restore();
  }

  function animateHighlight() {
    drawWheel();
    if (performance.now() - state.highlightStartedAt < 1100) {
      requestAnimationFrame(animateHighlight);
    }
  }

  function drawLabel(item, angle, radius, size) {
    const labelRadius = radius * 0.63;
    const x = Math.cos(angle) * labelRadius;
    const y = Math.sin(angle) * labelRadius;
    const maxLength = state.items.length > 12 ? 8 : 12;
    const label = item.label.length > maxLength ? `${item.label.slice(0, maxLength)}…` : item.label;
    context.save();
    context.translate(x, y);
    let textAngle = angle + Math.PI / 2;
    if (textAngle > Math.PI / 2 && textAngle < Math.PI * 1.5) textAngle += Math.PI;
    context.rotate(textAngle);
    context.fillStyle = "#655c5a";
    context.font = `700 ${Math.max(10, Math.min(16, size / (state.items.length > 10 ? 31 : 25)))}px OkDandan, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 0, 0);
    context.restore();
  }

  function spin() {
    const items = state.items.filter((item) => item.label.trim());
    if (state.isSpinning || items.length < 2) return;
    state.isSpinning = true;
    state.lastResult = null;
    state.resultItemId = null;
    renderOptions();
    elements.spinLabel.textContent = "고르는 중...";
    elements.spinStatus.textContent = "룰렛이 회전 중입니다. 잠시만 기다려 주세요.";
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let randomWeight = Math.random() * totalWeight;
    const selectedIndex = items.findIndex((item) => {
      randomWeight -= item.weight;
      return randomWeight < 0;
    });
    let selectedStart = 0;
    for (let index = 0; index < selectedIndex; index += 1) selectedStart += TAU * items[index].weight / totalWeight;
    const selectedSlice = TAU * items[selectedIndex].weight / totalWeight;
    const desiredRotation = -(selectedStart + selectedSlice / 2);
    const delta = ((desiredRotation - state.currentRotation) % TAU + TAU) % TAU;
    const target = state.currentRotation + TAU * 5 + delta;
    const start = performance.now();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 4200;
    const startingRotation = state.currentRotation;

    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      state.currentRotation = startingRotation + (target - startingRotation) * eased;
      drawWheel();
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        state.currentRotation = target % TAU;
        finishSpin(items[selectedIndex]);
      }
    }
    requestAnimationFrame(frame);
  }

  function finishSpin(item) {
    state.isSpinning = false;
    state.lastResult = item.label;
    state.resultItemId = item.id;
    state.highlightStartedAt = performance.now();
    elements.spinLabel.textContent = "룰렛 돌리기";
    elements.spinStatus.textContent = `결과는 ${state.lastResult}입니다.`;
    elements.resultTitle.textContent = state.lastResult;
    elements.resultMessage.textContent = "오늘의 선택이 결정되었어요. 맛있고 즐거운 하루 보내세요!";
    elements.editOptions.hidden = false;
    elements.spinAgain.hidden = false;
    elements.resultCard.classList.add("result-reveal");
    window.setTimeout(() => elements.resultCard.classList.remove("result-reveal"), 600);
    renderOptions();
    drawWheel();
    animateHighlight();
  }

  function getPresets() {
    const stored = safeRead(STORAGE_KEYS.presets, []);
    if (!Array.isArray(stored)) return [];
    return stored.filter((preset) => (
      preset && typeof preset.id === "string" && typeof preset.name === "string" &&
      Array.isArray(preset.items) && sanitizeStoredOptions(preset.items).length > 0
    )).slice(0, MAX_PRESETS).map((preset) => ({
      ...preset,
      name: preset.name.trim(),
      items: sanitizeStoredOptions(preset.items),
    })).filter((preset) => preset.name);
  }

  function renderPresets() {
    elements.presetList.replaceChildren();
    const presets = state.presets;
    elements.emptyPresets.hidden = presets.length > 0;
    presets.forEach((preset) => {
      const item = document.createElement("div");
      item.className = "preset-item";
      const meta = document.createElement("div");
      meta.className = "preset-meta";
      const title = document.createElement("strong");
      title.textContent = preset.name;
      const count = document.createElement("span");
      count.textContent = `${preset.items.length}개 선택지`;
      meta.append(title, count);
      const actions = document.createElement("div");
      actions.className = "preset-actions";
      const load = document.createElement("button");
      load.type = "button";
      load.textContent = "불러오기";
      load.addEventListener("click", () => loadPreset(preset));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-preset";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => deletePreset(preset.id));
      actions.append(load, remove);
      item.append(meta, actions);
      elements.presetList.append(item);
    });
  }

  function loadPreset(preset) {
    if (state.items.length > 0 && !window.confirm("현재 목록을 이 프리셋으로 바꿀까요?")) return;
    state.items = sanitizeStoredOptions(preset.items);
    syncOptions();
    elements.presetDialog.close();
    showToast(`"${preset.name}" 프리셋을 불러왔어요.`);
  }

  function deletePreset(id) {
    const preset = state.presets.find((item) => item.id === id);
    if (!preset || !window.confirm(`"${preset.name}" 프리셋을 삭제할까요?`)) return;
    state.presets = state.presets.filter((item) => item.id !== id);
    safeWrite(STORAGE_KEYS.presets, state.presets);
    renderPresets();
    showToast("프리셋을 삭제했어요.");
  }

  function openSaveDialog() {
    elements.saveError.textContent = "";
    elements.presetName.value = "";
    elements.saveDialog.showModal();
    elements.presetName.focus();
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function savePreset(event) {
    event.preventDefault();
    const name = elements.presetName.value.trim();
    if (!name || state.items.length === 0) {
      elements.saveError.textContent = "이름과 선택지를 모두 확인해 주세요.";
      return;
    }
    const existing = state.presets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    if (existing && !window.confirm("같은 이름의 프리셋을 덮어쓸까요?")) return;
    const now = new Date().toISOString();
    const preset = { id: existing?.id || createId(), name, items: [...state.items], createdAt: existing?.createdAt || now, updatedAt: now };
    state.presets = existing ? state.presets.map((item) => item.id === existing.id ? preset : item) : [preset, ...state.presets];
    if (state.presets.length > MAX_PRESETS) state.presets = state.presets.slice(0, MAX_PRESETS);
    if (safeWrite(STORAGE_KEYS.presets, state.presets)) {
      elements.saveDialog.close();
      showToast(`"${name}" 프리셋을 저장했어요.`);
    }
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3000);
  }

  function init() {
    state.items = sanitizeStoredOptions(safeRead(STORAGE_KEYS.options, []));
    if (state.items.length === 0) {
      state.items = [
        createOption("", 1, COLORS[0]),
        createOption("", 1, COLORS[1]),
      ];
    }
    state.presets = getPresets();
    safeWrite(STORAGE_KEYS.presets, state.presets);
    elements.addOption.addEventListener("click", () => {
      if (state.items.length >= MAX_ITEMS) return;
      state.items.push(createOption("", 1, COLORS[state.items.length % COLORS.length]));
      syncOptions();
      const lastInput = elements.optionsList.lastElementChild?.querySelector("input[type='text']");
      if (lastInput) lastInput.focus();
    });
    elements.clear.addEventListener("click", () => {
      state.items = [];
      state.lastResult = null;
      syncOptions();
      elements.resultTitle.textContent = "아직 결과가 없어요";
      elements.resultMessage.textContent = "룰렛을 돌리면 오늘의 선택이 여기에 나타나요.";
      elements.editOptions.hidden = true;
      elements.spinAgain.hidden = true;
    });
    elements.spin.addEventListener("click", spin);
    elements.spinAgain.addEventListener("click", spin);
    elements.editOptions.addEventListener("click", () => elements.optionsList.querySelector("input")?.focus());
    elements.savePreset.addEventListener("click", openSaveDialog);
    elements.saveForm.addEventListener("submit", savePreset);
    elements.openPresets.addEventListener("click", () => {
      renderPresets();
      elements.presetDialog.showModal();
    });
    elements.closePresets.addEventListener("click", () => elements.presetDialog.close());
    elements.closeSave.addEventListener("click", () => elements.saveDialog.close());
    elements.cancelSave.addEventListener("click", () => elements.saveDialog.close());
    window.addEventListener("resize", resizeCanvas);
    if ("ResizeObserver" in window) new ResizeObserver(resizeCanvas).observe(elements.canvas);
    syncOptions();
    resizeCanvas();
  }

  init();
})();
