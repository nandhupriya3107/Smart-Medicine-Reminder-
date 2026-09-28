/**
 * Smart Medicine Box Hardware Simulator (IoT Digital Twin)
 * Simulates the ESP32, DS3231 RTC, SSD1306 OLED, Buzzer, LEDs, and ESP32-CAM module.
 */

let boxState = {
  lidOpen: false,
  alarmActive: false,
  activeCompartment: 1,
  pillStatus: [true, true, true, true], // Comp 1..4 (true = pill present, false = removed)
  ledState: { green: false, yellow: false, red: false },
  webcamStream: null,
  webcamActive: false
};

let simBuzzerInterval = null;

function initBoxSimulator(data) {
  if (data && data.boxState) {
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
    boxState.activeCompartment = medicine.compartmentNumber || 1;
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
        if (boxState.alarmActive && window.soundEngine) {
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
    body: JSON.stringify({ action, open: boxState.lidOpen })
  }).catch(() => {});

  if (boxState.lidOpen) {
    logToSerial(`[ESP32-CAM] Box lid open interrupt detected! Triggering camera frame capture...`, "info");
    triggerCameraFramePreview();
  } else {
    const previewArea = document.getElementById('camPreviewArea');
    if (previewArea && !boxState.webcamActive) {
      previewArea.innerHTML = `
        <i class="fa-solid fa-video"></i>
        <span>Lid is closed. Open lid to trigger camera inspection snapshot.</span>
      `;
    }
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

  // Refresh camera inspection if open or active
  triggerCameraFramePreview();
}

// Live Webcam Toggle (Laptop Camera or Simulation)
async function toggleLiveWebcam() {
  const previewArea = document.getElementById('camPreviewArea');
  if (!previewArea) return;

  if (boxState.webcamActive && boxState.webcamStream) {
    // Turn off webcam
    boxState.webcamStream.getTracks().forEach(track => track.stop());
    boxState.webcamStream = null;
    boxState.webcamActive = false;
    logToSerial(`[WEBCAM] Laptop camera stream stopped.`, "info");
    triggerCameraFramePreview();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    boxState.webcamStream = stream;
    boxState.webcamActive = true;
    logToSerial(`[WEBCAM] Laptop camera stream connected successfully.`, "success");

    previewArea.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%;">
        <video id="liveWebcamVideo" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;"></video>
        <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); color: #4ade80; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-family: monospace;">
          <i class="fa-solid fa-circle" style="color: #ef4444; font-size: 0.6rem;"></i> REC • LIVE CAM
        </div>
      </div>
    `;

    const videoEl = document.getElementById('liveWebcamVideo');
    if (videoEl) videoEl.srcObject = stream;

    showToast("Webcam Active", "Live camera feed active! Click Capture to inspect.", "success");
  } catch (err) {
    console.warn("Webcam access error:", err);
    logToSerial(`[WEBCAM] Webcam access not granted, switching to AI Vision Simulator mode.`, "warn");
    boxState.webcamActive = false;
    triggerCameraFramePreview();
    showToast("AI Simulator Mode", "Using high-precision Computer Vision simulator.", "info");
  }
}

function triggerCameraFramePreview() {
  const previewArea = document.getElementById('camPreviewArea');
  const compNum = boxState.activeCompartment || 1;
  const isRemoved = !boxState.pillStatus[compNum - 1];

  if (!previewArea) return;

  if (boxState.webcamActive) return;

  previewArea.innerHTML = `
    <div style="text-align: center; color: white; padding: 1.5rem;">
      <div style="font-size: 2.8rem; margin-bottom: 0.5rem;">
        ${isRemoved ? '<i class="fa-solid fa-circle-check" style="color: #4ade80;"></i>' : '<i class="fa-solid fa-capsules" style="color: #38bdf8;"></i>'}
      </div>
      <div style="font-family: monospace; font-weight: bold; font-size: 1.1rem; letter-spacing: 0.5px;">
        COMPARTMENT #${compNum} INSPECTION
      </div>
      <div style="font-size: 0.85rem; margin-top: 0.4rem; color: ${isRemoved ? '#4ade80' : '#facc15'}; font-weight: 600;">
        ${isRemoved ? 'STATUS: EMPTY (PILL TAKEN)' : 'STATUS: TABLET DETECTED IN TRAY'}
      </div>
      <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.3rem;">
        AI Confidence: ${isRemoved ? '98.4%' : '94.2%'} • Contour Area Analysis
      </div>
    </div>
  `;
}

// Physical Button Handlers
async function pressHardwareGreenButton() {
  logToSerial(`[GPIO_14] GREEN BUTTON PRESSED by User. Verifying intake...`, "info");
  if (window.soundEngine) window.soundEngine.playSuccessSound();

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

  try {
    const res = await fetch('/api/box/button', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buttonColor: 'GREEN',
        compartment: compNum
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
  if (window.soundEngine) window.soundEngine.playBuzzerSound();

  const ledRed = document.getElementById('ledRed');
  if (ledRed) {
    ledRed.classList.add('active');
    setTimeout(() => ledRed.classList.remove('active'), 4000);
  }

  try {
    const res = await fetch('/api/box/button', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buttonColor: 'RED' })
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

  // If lid is closed, auto open lid
  if (!boxState.lidOpen) {
    boxState.lidOpen = true;
    updateLidUI();
  }

  triggerCameraFramePreview();

  try {
    const res = await fetch('/api/box/verify-camera', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compartment: compNum,
        forceResult: isRemoved
      })
    });
    const data = await res.json();
    
    const banner = document.getElementById('cvStatusBanner');
    if (banner && data.verification) {
      if (data.verification.pillRemoved) {
        banner.className = 'cv-status-banner';
        banner.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> <span>${data.verification.details}</span>`;
      } else {
        banner.className = 'cv-status-banner warning';
        banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i> <span>${data.verification.details}</span>`;
      }
    }

    const details = (data.verification && data.verification.details) ? data.verification.details : `Inspected Compartment #${compNum}`;
    const pillRemoved = data.verification ? data.verification.pillRemoved : isRemoved;

    logToSerial(`[CV_RESULT] ${details}`, pillRemoved ? "success" : "warn");
    showToast("Camera Inspection", details, pillRemoved ? "success" : "warning");
  } catch (err) {
    console.error("Camera inspection error:", err);
    showToast("Camera Active", `Inspected Compartment #${compNum}. Pill status recorded.`, "info");
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
