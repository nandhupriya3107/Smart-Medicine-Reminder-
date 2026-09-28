/**
 * Senior Citizen View Controller
 */

let countdownTimerInterval = null;
let currentAlarmData = null;

function initSeniorView(data) {
  renderSeniorHeader(data.patient);
  renderSeniorSchedule(data.medicines);
  
  if (data.boxState && data.boxState.activeAlarm) {
    showActiveAlarm(data.boxState.activeAlarm);
  } else {
    hideActiveAlarm();
  }
}

function renderSeniorHeader(patient) {
  if (!patient) return;
  const greetingEl = document.getElementById('seniorGreeting');
  const dateEl = document.getElementById('seniorDateDisplay');
  
  const now = new Date();
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  
  if (greetingEl) greetingEl.textContent = `Hello, ${patient.name}!`;
  if (dateEl) dateEl.textContent = `Today is ${now.toLocaleDateString('en-US', options)}`;
}

function renderSeniorSchedule(medicines) {
  const container = document.getElementById('seniorScheduleGrid');
  if (!container) return;

  if (!medicines || medicines.length === 0) {
    container.innerHTML = `<div class="empty-notice">No medications scheduled for today.</div>`;
    return;
  }

  container.innerHTML = medicines.map(med => `
    <div class="senior-med-card" style="border-top: 5px solid ${med.color || '#3b82f6'}">
      <div class="med-card-top">
        <span class="med-card-comp">Compartment #${med.compartmentNumber}</span>
        <span class="med-card-time">${med.time}</span>
      </div>
      <h4>${med.name}</h4>
      <div class="med-card-dose">${med.dosage}</div>
      <div class="med-card-meal"><i class="fa-solid fa-utensils"></i> ${med.mealTime}</div>
    </div>
  `).join('');
}

function showActiveAlarm(alarm) {
  currentAlarmData = alarm;
  const med = alarm.medicine;

  const alarmBanner = document.getElementById('activeAlarmBanner');
  const peacefulBanner = document.getElementById('noAlarmBanner');
  
  const medNameEl = document.getElementById('alarmMedName');
  const doseEl = document.getElementById('alarmDose');
  const compTagEl = document.getElementById('alarmCompartmentTag');
  const instructionEl = document.getElementById('alarmInstruction');

  if (medNameEl) medNameEl.textContent = med.name;
  if (doseEl) doseEl.textContent = med.dosage;
  if (compTagEl) compTagEl.innerHTML = `<i class="fa-solid fa-box-open"></i> Open Box Compartment #${med.compartmentNumber}`;
  if (instructionEl) instructionEl.textContent = med.instructions || "Please take on time with water.";

  if (alarmBanner) alarmBanner.classList.remove('hidden');
  if (peacefulBanner) peacefulBanner.classList.add('hidden');

  // Start sound & alarm chime
  window.soundEngine.startReminderAlarm();

  // Voice Announcement
  const voiceMessage = `Attention please. It is time to take your medication: ${med.name}, ${med.dosage}. Please open compartment number ${med.compartmentNumber}.`;
  window.soundEngine.speakText(voiceMessage);

  // Start Live Countdown
  startCountdown(alarm.expiresAt);
}

function hideActiveAlarm() {
  currentAlarmData = null;
  const alarmBanner = document.getElementById('activeAlarmBanner');
  const peacefulBanner = document.getElementById('noAlarmBanner');

  if (alarmBanner) alarmBanner.classList.add('hidden');
  if (peacefulBanner) peacefulBanner.classList.remove('hidden');

  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  window.soundEngine.stopReminderAlarm();
}

function startCountdown(expiresAt) {
  if (countdownTimerInterval) clearInterval(countdownTimerInterval);

  const countdownEl = document.getElementById('alarmCountdown');
  const targetTime = new Date(expiresAt).getTime();

  function update() {
    const now = Date.now();
    const remainingMs = targetTime - now;

    if (remainingMs <= 0) {
      if (countdownEl) countdownEl.textContent = "00:00 - ESCALATING SMS!";
      clearInterval(countdownTimerInterval);
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    if (countdownEl) {
      countdownEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }

  update();
  countdownTimerInterval = setInterval(update, 1000);
}

// User Actions from Senior UI
async function confirmMedicationTaken(method = "MOBILE_APP") {
  window.soundEngine.stopReminderAlarm();
  window.soundEngine.playSuccessSound();
  window.soundEngine.speakText("Thank you! Medication confirmed as taken.");

  try {
    const medId = currentAlarmData ? currentAlarmData.medicineId : null;
    const response = await fetch('/api/reminders/taken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicineId: medId, method: method })
    });
    const data = await response.json();
    hideActiveAlarm();
    showToast("Medication Taken", "Logged successfully! Have a healthy day.", "success");
  } catch (err) {
    console.error("Error confirming medication:", err);
  }
}

async function snoozeAlarm(minutes = 5) {
  window.soundEngine.stopReminderAlarm();
  window.soundEngine.speakText(`Reminder snoozed. I will remind you again in ${minutes} minutes.`);

  try {
    const medId = currentAlarmData ? currentAlarmData.medicineId : null;
    await fetch('/api/reminders/snooze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicineId: medId, minutes })
    });
    hideActiveAlarm();
    showToast("Reminder Snoozed", `Alarm will re-ring in ${minutes} minutes.`, "info");
  } catch (err) {
    console.error("Error snoozing:", err);
  }
}

async function triggerEmergencySOS(source = "SENIOR_APP") {
  window.soundEngine.stopReminderAlarm();
  window.soundEngine.playBuzzerSound();
  window.soundEngine.speakText("Emergency alert sent! Your family members have been notified.");

  try {
    await fetch('/api/reminders/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source })
    });
    showToast("EMERGENCY SOS SENT", "Family members alerted via SMS immediately!", "error");
  } catch (err) {
    console.error("Error sending SOS:", err);
  }
}

function speakCurrentStatus() {
  if (currentAlarmData) {
    const med = currentAlarmData.medicine;
    window.soundEngine.speakText(`You have an active reminder for ${med.name}, ${med.dosage} in compartment number ${med.compartmentNumber}. Please take it now.`);
  } else {
    window.soundEngine.speakText("You are all caught up! No urgent medications right now.");
  }
}

async function triggerImmediateTestAlarm() {
  try {
    const res = await fetch('/api/reminders/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    showToast("Test Alarm Triggered", "Testing the reminder workflow!", "info");
  } catch (err) {
    console.error(err);
  }
}
