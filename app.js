(() => {
  const MODES = ["COOL", "HEAT", "FAN", "DRY", "AUTO"];
  const FAN_LABELS = ["AUTO", "BAJA", "MEDIA", "ALTA"];
  const STORAGE_KEY = "tokyo-remote-state-v1";
  const SETTINGS_KEY = "tokyo-remote-settings-v1";

  const defaultState = () => ({
    power: true,
    mode: "COOL",
    temp: 24,
    fan: 0,
    timerHours: 0,
    swingH: false,
    swingV: false,
    menuOpen: false,
  });

  const defaultSettings = () => ({
    webhookUrl: "",
    haptics: true,
    sounds: true,
  });

  let state = load(STORAGE_KEY, defaultState);
  let settings = load(SETTINGS_KEY, defaultSettings);

  const els = {
    lcd: document.getElementById("lcd"),
    lcdPower: document.getElementById("lcdPower"),
    lcdTimer: document.getElementById("lcdTimer"),
    lcdFan: document.getElementById("lcdFan"),
    lcdMode: document.getElementById("lcdMode"),
    lcdTemp: document.getElementById("lcdTemp"),
    lcdSwing: document.getElementById("lcdSwing"),
    statusLine: document.getElementById("statusLine"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    webhookUrl: document.getElementById("webhookUrl"),
    haptics: document.getElementById("haptics"),
    sounds: document.getElementById("sounds"),
    saveSettings: document.getElementById("saveSettings"),
    resetState: document.getElementById("resetState"),
  };

  const audioCtx = (() => {
    try {
      return new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  })();

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...fallback(), ...JSON.parse(raw) } : fallback();
    } catch {
      return fallback();
    }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clampTemp(n) {
    return Math.min(35, Math.max(16, n));
  }

  function modeFromAction(action) {
    if (action === "frio") return "COOL";
    if (action === "calor") return "HEAT";
    return null;
  }

  function render() {
    els.lcd.classList.toggle("off", !state.power);
    els.lcdPower.classList.toggle("on", state.power);
    els.lcdPower.textContent = state.power ? "●" : "○";
    els.lcdMode.textContent = state.power ? state.mode : "— — —";
    els.lcdTemp.textContent = state.power ? String(state.temp) : "--";
    els.lcdFan.textContent = state.power ? FAN_LABELS[state.fan] : "";
    els.lcdTimer.textContent =
      state.power && state.timerHours > 0 ? `T${state.timerHours}H` : "";

    const swings = [];
    if (state.swingH) swings.push("OSC H");
    if (state.swingV) swings.push("OSC V");
    if (state.menuOpen) swings.push("MENÚ");
    els.lcdSwing.textContent = state.power ? swings.join(" · ") : "";
  }

  function setStatus(msg, ms = 1600) {
    els.statusLine.textContent = msg;
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(() => {
      els.statusLine.textContent = state.power
        ? `${state.mode} · ${state.temp}°C · ${FAN_LABELS[state.fan]}`
        : "Apagado · Pulsa ON/OFF";
    }, ms);
  }

  function clickSound() {
    if (!settings.sounds || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 880;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    osc.stop(audioCtx.currentTime + 0.06);
  }

  function haptic() {
    if (!settings.haptics || !navigator.vibrate) return;
    navigator.vibrate(12);
  }

  async function emit(action) {
    const payload = {
      brand: "TOKYO",
      model: "xperience+",
      action,
      state: { ...state },
      ts: Date.now(),
    };

    if (!settings.webhookUrl) return;

    try {
      await fetch(settings.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        mode: "cors",
        keepalive: true,
      });
    } catch (err) {
      setStatus("Webhook no alcanzó el puente", 2200);
      console.warn("Webhook failed", err);
    }
  }

  function handle(action, button) {
    if (button) {
      button.classList.add("pressed");
      setTimeout(() => button.classList.remove("pressed"), 120);
    }

    clickSound();
    haptic();

    switch (action) {
      case "power":
        state.power = !state.power;
        setStatus(state.power ? "Encendido" : "Apagado");
        break;
      case "frio":
      case "calor": {
        if (!state.power) state.power = true;
        state.mode = modeFromAction(action);
        setStatus(state.mode === "COOL" ? "Modo frío" : "Modo calor");
        break;
      }
      case "modo": {
        if (!state.power) state.power = true;
        const i = MODES.indexOf(state.mode);
        state.mode = MODES[(i + 1) % MODES.length];
        setStatus(`Modo ${state.mode}`);
        break;
      }
      case "veloc": {
        if (!state.power) break;
        state.fan = (state.fan + 1) % FAN_LABELS.length;
        setStatus(`Velocidad ${FAN_LABELS[state.fan]}`);
        break;
      }
      case "tiempo": {
        if (!state.power) break;
        state.timerHours = (state.timerHours + 1) % 13;
        setStatus(
          state.timerHours === 0
            ? "Temporizador off"
            : `Apaga en ${state.timerHours} h`
        );
        break;
      }
      case "temp-up":
        if (!state.power) break;
        state.temp = clampTemp(state.temp + 1);
        setStatus(`${state.temp}°C`);
        break;
      case "temp-down":
        if (!state.power) break;
        state.temp = clampTemp(state.temp - 1);
        setStatus(`${state.temp}°C`);
        break;
      case "swing-h":
        if (!state.power) break;
        state.swingH = !state.swingH;
        setStatus(state.swingH ? "Oscilar Izq/Der" : "Oscilación H off");
        break;
      case "swing-v":
        if (!state.power) break;
        state.swingV = !state.swingV;
        setStatus(state.swingV ? "Oscilar Arr/Abj" : "Oscilación V off");
        break;
      case "menu":
        if (!state.power) break;
        state.menuOpen = !state.menuOpen;
        setStatus(state.menuOpen ? "Menú" : "OK");
        break;
      default:
        break;
    }

    save(STORAGE_KEY, state);
    render();
    emit(action);
  }

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      handle(btn.dataset.action, btn);
    });
  });

  els.settingsBtn.addEventListener("click", () => {
    els.webhookUrl.value = settings.webhookUrl || "";
    els.haptics.checked = !!settings.haptics;
    els.sounds.checked = !!settings.sounds;
    els.settingsDialog.showModal();
  });

  els.saveSettings.addEventListener("click", () => {
    settings = {
      webhookUrl: els.webhookUrl.value.trim(),
      haptics: els.haptics.checked,
      sounds: els.sounds.checked,
    };
    save(SETTINGS_KEY, settings);
    els.settingsDialog.close();
    setStatus(
      settings.webhookUrl ? "Webhook guardado" : "Ajustes guardados (sin puente)"
    );
  });

  els.resetState.addEventListener("click", () => {
    state = defaultState();
    save(STORAGE_KEY, state);
    render();
    setStatus("Estado reiniciado");
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  render();
  setStatus("Listo · Añade a Inicio para usarlo como app", 2800);
})();
