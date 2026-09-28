/**
 * Smart Medicine Box Hardware Simulator (IoT Digital Twin)
 * Simulates the ESP32, DS3231 RTC, SSD1306 OLED, Buzzer, LEDs, and ESP32-CAM module.
 */

let boxState = {
  lidOpen: false,
  alarmActive: false,
  activeCompartment: 1,
  pillStatus: [true, true, true, true], // Comp 1..4 (true = pill present, false = removed)
  ledState: { green: false, yellow: false, red: false }
};

let simBuzzerInterval = null;

function initBoxSimulator(data) {
  if (data.boxState) {
    boxState.lidOpen = !!data.boxState.lidOpen;
    updateLidUI();
    if (data.boxState.activeAlarm) {
      setBoxAlarmState(true, data.boxState.activeAlarm.medicine);
    } else {
      setBoxAlarmState(false);
    }
  }
}

function updateBoxOled(title, sub, timeText) {
  const oledMain = document.getElementById('oledMain');
  const oledClock = document.getElementById('oledClock');

  if (oledClock) {
    const now = new Date();
    oledClock.textContent = now.toLocaleTimeString('en-US', { hour12: false });
  }

  if (oledMain) {
    oledMain.innerHTML = `
      <div class="oled-title">${title || 'SMART REM BOX'}</div>
      <div class="oled-sub">${sub || 'STANDBY - ALL SAFE'}</div>
      <div class="oled-time">${timeText || ''}</div>
    `;
  }
}

function setBoxAlarmState(isActive, medicine = null) {
  boxState.alarmActive = isActive;
  const buzzerMod = document.getElementById('simBuzzerModule');
  const ledYellow = document.getElementById('ledYellow');
  const ledGreen = document.getElementById('ledGreen');
  const ledRed = document.getElementById('ledRed');

  if (isActive && medicine) {
    boxState.activeCompartment = medicine.compartmentNumber;
    updateBoxOled("MEDICINE TIME!", `COMP #${medicine.compartmentNumber}: ${medicine.name.substring(0, 14)}`, `DOSE: ${medicine.dosage}`);
    
    // Highlight compartment
    for (let i = 1; i <= 4; i++) {
      const cell = document.getElementById(`compCell${i}`);
      if (cell) {
        if (i === medicine.compartmentNumber) {
          cell.classList.add('active-slot');
        } else {
          cell.classList.remove('active-slot');
        }
      }
    }

    // Set LED Yellow active
    if (ledYellow) ledYellow.classList.add('active');
    if (ledGreen) ledGreen.classList.remove('active');
    if (ledRed) ledRed.classList.remove('active');

    // Start Buzzer pulsation
    if (buzzerMod) buzzerMod.classList.add('buzzer-active');
    if (!simBuzzerInterval) {
      simBuzzerInterval = setInterval(() => {
        if (boxState.alarmActive) {
          window.soundEngine.playBuzzerSound();
        }
      }, 2500);
    }

    logToSerial(`[ALARM_TRIGGER] Scheduled reminder for ${medicine.name} in Comp #${medicine.compartmentNumber}`, "warn");

  } else {
    // Return to standby
    updateBoxOled("SMART REM BOX", "STANDBY - ALL SAFE", "SYSTEM READY");
    if (ledYellow) ledYellow.classList.remove('active');
    if (buzzerMod) buzzerMod.classList.remove('buzzer-active');
    
    if (simBuzzerInterval) {
      clearInterval(simBuzzerInterval);
      simBuzzerInterval = null;
    }

    for (let i = 1; i <= 4; i++) {
      const cell = document.getElementById(`compCell${i}`);
      if (cell) cell.classList.remove('active-slot');
    }
  }
}

function toggleBoxLid() {
  boxState.lidOpen = !boxState.lidOpen;
  updateLidUI();

  const action = boxState.lidOpen ? 'LID_OPENED' : 'LID_CLOSED';
  logToSerial(`[REED_SWITCH] Box Lid state changed: ${boxState.lidOpen ? 'OPENED' : 'CLOSED'}`, "info");

  fetch('/api/box/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });

  if (boxState.lidOpen) {
    // If lid opened during an active reminder, snap camera check
    logToSerial(`[ESP32-CAM] Box lid open interrupt detected! Triggering camera frame capture...`, "info");
    triggerCameraFramePreview();
  }
}

function updateLidUI() {
  const lidDot = document.getElementById('lidDot');
  const lidText = document.getElementById('lidText');
  const lidBtnLabel = document.getElementById('lidBtnLabel');
  const chassis = document.querySelector('.box-physical-frame');

  if (boxState.lidOpen) {
    if (lidDot) lidDot.style.background = '#10b981';
    if (lidText) lidText.textContent = 'LID: OPEN (CAMERA READY)';
    if (lidBtnLabel) lidBtnLabel.textContent = 'Close Box Lid';
    if (chassis) chassis.classList.add('lid-open');
  } else {
    if (lidDot) lidDot.style.background = '#ef4444';
    if (lidText) lidText.textContent = 'LID: CLOSED';
    if (lidBtnLabel) lidBtnLabel.textContent = 'Open Box Lid';
    if (chassis) chassis.classList.remove('lid-open');
  }
}

function togglePillInCompartment(compNum) {
  const idx = compNum - 1;
  boxState.pillStatus[idx] = !boxState.pillStatus[idx];

  const pillGraphic = document.getElementById(`pillGraphic${compNum}`);
  const compTag = document.getElementById(`compTag${compNum}`);

  if (boxState.pillStatus[idx]) {
    if (pillGraphic) pillGraphic.classList.remove('pill-empty');
    if (compTag) {
      compTag.textContent = 'PILL PRESENT';
      compTag.classList.remove('empty');
    }
    logToSerial(`[SENSOR] Pill placed into Compartment #${compNum}`, "info");
  } else {
    if (pillGraphic) pillGraphic.classList.add('pill-empty');
    if (compTag) {
      compTag.textContent = 'PILL REMOVED';
      compTag.classList.add('empty');
    }
    logToSerial(`[SENSOR] Tablet removed from Compartment #${compNum}`, "success");
  }

  // If lid is open, refresh camera frame
  if (boxState.lidOpen) {
    triggerCameraFramePreview();
  }
}

function triggerCameraFramePreview() {
  const previewArea = document.getElementById('camPreviewArea');
  const compNum = boxState.activeCompartment || 1;
  const isRemoved = !boxState.pillStatus[compNum - 1];

  if (!previewArea) return;

  previewArea.innerHTML = `
    <div style="text-align: center; color: white;">
      <div style="font-size: 2.2rem; margin-bottom: 0.3rem;">
        ${isRemoved ? '<i class="fa-solid fa-circle-check" style="color: #4ade80;"></i>' : '<i class="fa-solid fa-capsules" style="color: #38bdf8;"></i>'}
      </div>
      <div style="font-family: monospace; font-weight: bold; font-size: 0.95rem;">
        COMPARTMENT #${compNum} INSPECTION
      </div>
      <div style="font-size: 0.8rem; color: ${isRemoved ? '#4ade80' : '#facc15'};">
        ${isRemoved ? 'STATUS: EMPTY (TABLET REMOVED)' : 'STATUS: TABLET DETECTED IN TRAY'}
      </div>
    </div>
  `;
}

// Physical Button Handlers
async function pressHardwareGreenButton() {
  logToSerial(`[GPIO_14] GREEN BUTTON PRESSED by User. Verifying intake...`, "info");
  window.soundEngine.playSuccessSound();

  const ledGreen = document.getElementById('ledGreen');
  if (ledGreen) {
    ledGreen.classList.add('active');
    setTimeout(() => ledGreen.classList.remove('active'), 3000);
  }

  const compNum = boxState.activeCompartment || 1;
  const isPillRemoved = !boxState.pillStatus[compNum - 1];

  // Auto remove pill if still inside to simulate senior taking it
  if (!isPillRemoved) {
    togglePillInCompartment(compNum);
  }

  // Call API for camera verification & intake confirmation
  try {
    const res = await fetch('/api/box/verify-pill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compartmentNumber: compNum,
        forceResult: true
      })
    });
    const data = await res.json();
    logToSerial(`[CV_ENGINE] Result: VERIFIED_REMOVED (Confidence 96%). Intake logged.`, "success");
    showToast("Intake Verified", "Green Button pressed. Tablet removal verified by camera!", "success");
    setBoxAlarmState(false);
  } catch (err) {
    console.error(err);
  }
}

async function pressHardwareRedButton() {
  logToSerial(`[GPIO_27] RED BUTTON (SOS / DECLINE) PRESSED! Initiating urgent escalation...`, "error");
  window.soundEngine.playBuzzerSound();

  const ledRed = document.getElementById('ledRed');
  if (ledRed) {
    ledRed.classList.add('active');
    setTimeout(() => ledRed.classList.remove('active'), 4000);
  }

  try {
    const res = await fetch('/api/box/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RED_BUTTON_PRESSED' })
    });
    const data = await res.json();
    logToSerial(`[GSM_MODEM] Emergency SOS SMS dispatched to all registered caregivers.`, "warn");
    showToast("EMERGENCY SOS", "Red Button pressed on Smart Box! Family alerted.", "error");
  } catch (err) {
    console.error(err);
  }
}

async function triggerManualCameraVerification() {
  const compNum = boxState.activeCompartment || 1;
  const isRemoved = !boxState.pillStatus[compNum - 1];

  logToSerial(`[ESP32-CAM] Manual inspection trigger: Scanning Compartment #${compNum}...`, "info");

  try {
    const res = await fetch('/api/box/verify-pill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compartmentNumber: compNum,
        forceResult: isRemoved
      })
    });
    const data = await res.json();
    
    const banner = document.getElementById('cvStatusBanner');
    if (banner) {
      if (data.verification.pillRemoved) {
        banner.className = 'cv-status-banner';
        banner.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${data.verification.details}`;
      } else {
        banner.className = 'cv-status-banner warning';
        banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.verification.details}`;
      }
    }

    logToSerial(`[CV_RESULT] ${data.verification.details}`, data.verification.pillRemoved ? "success" : "warn");
    showToast("Camera Inspection", data.verification.details, data.verification.pillRemoved ? "success" : "warning");
  } catch (err) {
    console.error(err);
  }
}

function logToSerial(msg, type = "info") {
  const win = document.getElementById('serialLogWindow');
  if (!win) return;

  const now = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${now}] ${msg}`;
  win.appendChild(line);
  win.scrollTop = win.scrollHeight;
}

function clearSerialLog() {
  const win = document.getElementById('serialLogWindow');
  if (win) {
    win.innerHTML = '<div class="log-line info">[CONSOLE] Serial Monitor Cleared.</div>';
  }
}
