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
    input: document.querySelector("#options-input"),
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

  function normalizeOptions(value) {
    const candidates = value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return [...new Set(candidates)];
  }

  function readOptions() {
    const normalized = normalizeOptions(elements.input.value);
    const hasTooMany = normalized.length > MAX_ITEMS;
    state.items = hasTooMany ? normalized.slice(0, MAX_ITEMS) : normalized;
    if (hasTooMany) {
      elements.hint.textContent = `선택지는 최대 ${MAX_ITEMS}개까지 입력할 수 있어요. 초과 항목은 반영되지 않았어요.`;
      elements.hint.classList.add("error");
    } else {
      elements.hint.classList.remove("error");
    }
    return hasTooMany;
  }

  function syncOptions() {
    const wasTooMany = readOptions();
    renderOptions();
    if (!wasTooMany) {
      safeWrite(STORAGE_KEYS.options, state.items);
    }
    drawWheel();
  }

  function renderOptions() {
    const count = state.items.length;
    elements.count.textContent = `${count} / ${MAX_ITEMS}`;
    elements.count.setAttribute("aria-label", `선택지 ${count}개`);
    elements.preview.replaceChildren();
    state.items.slice(0, 8).forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "option-chip";
      chip.textContent = item;
      elements.preview.append(chip);
    });
    if (count > 8) {
      const more = document.createElement("span");
      more.className = "option-chip more";
      more.textContent = `+${count - 8}개 더`;
      elements.preview.append(more);
    }
    elements.spin.disabled = count < 2 || state.isSpinning;
    elements.savePreset.disabled = count < 1 || state.isSpinning;
    elements.clear.disabled = count === 0 || state.isSpinning;
    elements.emptyWheel.hidden = count > 0;
    if (!state.isSpinning) {
      if (count < 2) {
        elements.hint.textContent = count === 0 ? "최소 2개부터 시작할 수 있어요." : "한 가지 선택지가 더 필요해요.";
      } else if (!elements.hint.classList.contains("error")) {
        elements.hint.textContent = "룰렛을 돌릴 수 있어요.";
      }
    }
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
    if (!state.items.length) return;
    const slice = TAU / state.items.length;
    context.save();
    context.translate(center, center);
    context.rotate(state.currentRotation);
    state.items.forEach((item, index) => {
      const start = -Math.PI / 2 + index * slice;
      const end = start + slice;
      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, radius, start, end);
      context.closePath();
      context.fillStyle = COLORS[index % COLORS.length];
      context.fill();
      context.strokeStyle = "rgba(255,255,255,.8)";
      context.lineWidth = Math.max(2, size / 170);
      context.stroke();
      drawLabel(item, start + slice / 2, radius, size);
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

  function drawLabel(item, angle, radius, size) {
    const labelRadius = radius * 0.63;
    const x = Math.cos(angle) * labelRadius;
    const y = Math.sin(angle) * labelRadius;
    const maxLength = state.items.length > 12 ? 8 : 12;
    const label = item.length > maxLength ? `${item.slice(0, maxLength)}…` : item;
    context.save();
    context.translate(x, y);
    let textAngle = angle + Math.PI / 2;
    if (textAngle > Math.PI / 2 && textAngle < Math.PI * 1.5) textAngle += Math.PI;
    context.rotate(textAngle);
    context.fillStyle = "#655c5a";
    context.font = `700 ${Math.max(10, Math.min(16, size / (state.items.length > 10 ? 31 : 25)))}px Trebuchet MS, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 0, 0);
    context.restore();
  }

  function spin() {
    if (state.isSpinning || state.items.length < 2) return;
    state.isSpinning = true;
    state.lastResult = null;
    renderOptions();
    elements.spinLabel.textContent = "고르는 중...";
    elements.spinStatus.textContent = "룰렛이 회전 중입니다. 잠시만 기다려 주세요.";
    const selectedIndex = Math.floor(Math.random() * state.items.length);
    const slice = TAU / state.items.length;
    const desiredRotation = -(selectedIndex + 0.5) * slice;
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
        finishSpin(selectedIndex);
      }
    }
    requestAnimationFrame(frame);
  }

  function finishSpin(index) {
    state.isSpinning = false;
    state.lastResult = state.items[index];
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
  }

  function getPresets() {
    const stored = safeRead(STORAGE_KEYS.presets, []);
    if (!Array.isArray(stored)) return [];
    return stored.filter((preset) => (
      preset && typeof preset.id === "string" && typeof preset.name === "string" &&
      Array.isArray(preset.items) && preset.items.length > 0
    ));
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
    elements.input.value = preset.items.join("\n");
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
    state.items = safeRead(STORAGE_KEYS.options, []);
    if (!Array.isArray(state.items)) state.items = [];
    elements.input.value = state.items.join("\n");
    state.presets = getPresets();
    elements.input.addEventListener("input", syncOptions);
    elements.clear.addEventListener("click", () => {
      elements.input.value = "";
      state.lastResult = null;
      syncOptions();
      elements.resultTitle.textContent = "아직 결과가 없어요";
      elements.resultMessage.textContent = "룰렛을 돌리면 오늘의 선택이 여기에 나타나요.";
      elements.editOptions.hidden = true;
      elements.spinAgain.hidden = true;
    });
    elements.spin.addEventListener("click", spin);
    elements.spinAgain.addEventListener("click", spin);
    elements.editOptions.addEventListener("click", () => elements.input.focus());
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
