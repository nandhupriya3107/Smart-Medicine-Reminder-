/**
 * SMART REM - Master Frontend Application
 */

window.globalState = {
  patient: null,
  medicines: [],
  caregivers: [],
  logs: [],
  notifications: [],
  boxState: null,
  settings: null,
  currentView: 'senior'
};

// Connect to Socket.io with safe fallback
let socket = null;
if (typeof io !== 'undefined') {
  try {
    socket = io({
      transports: ['websocket', 'polling'],
      timeout: 5000,
      reconnectionAttempts: 3
    });
  } catch (err) {
    console.warn("Socket.io initialization warning:", err);
  }
}

// Clock updater
function startClock() {
  const clockEl = document.getElementById('clockDisplay');
  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    }
  }
  update();
  setInterval(update, 1000);
}

// View switcher
function switchView(viewName) {
  window.globalState.currentView = viewName;

  // Toggle nav tabs
  const navSenior = document.getElementById('btnNavSenior');
  const navBox = document.getElementById('btnNavBox');
  const navCaregiver = document.getElementById('btnNavCaregiver');

  if (navSenior) navSenior.classList.toggle('active', viewName === 'senior');
  if (navBox) navBox.classList.toggle('active', viewName === 'box');
  if (navCaregiver) navCaregiver.classList.toggle('active', viewName === 'caregiver');

  // Toggle view panels
  const viewSenior = document.getElementById('viewSenior');
  const viewBox = document.getElementById('viewBox');
  const viewCaregiver = document.getElementById('viewCaregiver');

  if (viewSenior) viewSenior.classList.toggle('active', viewName === 'senior');
  if (viewBox) viewBox.classList.toggle('active', viewName === 'box');
  if (viewCaregiver) viewCaregiver.classList.toggle('active', viewName === 'caregiver');
}

// Modal Helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// Toast Popup Notification
let toastTimeout = null;
function showToast(title, message, type = "info") {
  const toast = document.getElementById('toastNotification');
  const icon = document.getElementById('toastIcon');
  const titleEl = document.getElementById('toastTitle');
  const msgEl = document.getElementById('toastMessage');

  if (!toast) return;

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  if (icon) {
    if (type === 'success') {
      icon.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
    } else if (type === 'error') {
      icon.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>';
    } else if (type === 'warning') {
      icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i>';
    } else {
      icon.innerHTML = '<i class="fa-solid fa-bell" style="color: #3b82f6;"></i>';
    }
  }

  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 4500);
}

// --------------------------------------------------------------------------
// REST API DATA LOADER
// --------------------------------------------------------------------------

async function loadInitialStateFromApi() {
  try {
    const [patient, medicines, caregivers, logs, notifs, settings, boxState] = await Promise.all([
      fetch('/api/patient').then(r => r.json()).catch(() => null),
      fetch('/api/medicines').then(r => r.json()).catch(() => []),
      fetch('/api/caregivers').then(r => r.json()).catch(() => []),
      fetch('/api/logs').then(r => r.json()).catch(() => []),
      fetch('/api/notifications').then(r => r.json()).catch(() => []),
      fetch('/api/settings').then(r => r.json()).catch(() => null),
      fetch('/api/box/state').then(r => r.json()).catch(() => null)
    ]);

    const state = {
      patient: patient || window.globalState.patient,
      medicines: Array.isArray(medicines) ? medicines : (window.globalState.medicines || []),
      caregivers: Array.isArray(caregivers) ? caregivers : (window.globalState.caregivers || []),
      logs: Array.isArray(logs) ? logs : (window.globalState.logs || []),
      notifications: Array.isArray(notifs) ? notifs : (window.globalState.notifications || []),
      settings: settings || window.globalState.settings,
      boxState: boxState || window.globalState.boxState
    };

    window.globalState = { ...window.globalState, ...state };

    if (typeof initSeniorView === 'function') initSeniorView(state);
    if (typeof initBoxSimulator === 'function') initBoxSimulator(state);
    if (typeof initCaregiverView === 'function') initCaregiverView(state);

    const badge = document.getElementById('connectionBadge');
    if (badge) {
      badge.className = 'status-badge status-online';
      badge.innerHTML = '<span class="dot"></span> Active';
    }
  } catch (err) {
    console.warn("REST load error:", err);
  }
}

// --------------------------------------------------------------------------
// WEBSOCKET REAL-TIME EVENT HANDLERS
// --------------------------------------------------------------------------

if (socket) {
  socket.on('connect', () => {
    console.log('Connected to SMART REM IoT Backend!');
    const badge = document.getElementById('connectionBadge');
    if (badge) {
      badge.className = 'status-badge status-online';
      badge.innerHTML = '<span class="dot"></span> Online';
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected, operating in REST mode.');
  });

  socket.on('initial_state', (state) => {
    window.globalState = { ...window.globalState, ...state };
    console.log('Received initial system state:', state);

    if (typeof initSeniorView === 'function') initSeniorView(state);
    if (typeof initBoxSimulator === 'function') initBoxSimulator(state);
    if (typeof initCaregiverView === 'function') initCaregiverView(state);
  });

  // Alarm Start Event
  socket.on('medication_alarm_start', (data) => {
    console.log('🚨 Medication Alarm Triggered:', data);
    if (typeof showActiveAlarm === 'function') showActiveAlarm(data.alarm);
    if (typeof setBoxAlarmState === 'function') setBoxAlarmState(true, data.alarm.medicine);
    if (typeof logToSerial === 'function') logToSerial(`[SCHEDULE_MATCH] Active Reminder started for ${data.alarm.medicine.name}. Grace timer active.`, "warn");
    showToast("Medicine Time!", `Time to take ${data.alarm.medicine.name}`, "warning");
  });

  // Medication Taken Confirmed
  socket.on('medication_taken_confirmed', (data) => {
    console.log('✅ Medication Intake Confirmed:', data);
    if (typeof hideActiveAlarm === 'function') hideActiveAlarm();
    if (typeof setBoxAlarmState === 'function') setBoxAlarmState(false);
    
    if (data.log) {
      window.globalState.logs.unshift(data.log);
      if (typeof renderIntakeHistory === 'function') renderIntakeHistory(window.globalState.logs);
      if (typeof updateComplianceStats === 'function') updateComplianceStats(window.globalState.logs);
    }

    if (typeof logToSerial === 'function') logToSerial(`[INTAKE_SUCCESS] Medicine intake confirmed via ${data.method}.`, "success");
  });

  // Reminder Snoozed
  socket.on('medication_snoozed', (data) => {
    if (typeof hideActiveAlarm === 'function') hideActiveAlarm();
    if (typeof setBoxAlarmState === 'function') setBoxAlarmState(false);
    if (typeof logToSerial === 'function') logToSerial(`[SNOOZE] Reminder snoozed for ${data.snoozeMinutes} mins.`, "info");
  });

  // Alarm Escalation to Family
  socket.on('medication_alarm_escalated', (data) => {
    console.log('⚠️ Reminder Escalated to Family SMS:', data);
    if (window.soundEngine && typeof window.soundEngine.speakText === 'function') {
      window.soundEngine.speakText("Attention: Medication confirmation window has elapsed. Family members have been notified.");
    }
    
    if (data.log) {
      window.globalState.logs.unshift(data.log);
      if (typeof renderIntakeHistory === 'function') renderIntakeHistory(window.globalState.logs);
      if (typeof updateComplianceStats === 'function') updateComplianceStats(window.globalState.logs);
    }

    if (data.smsAlerts) {
      data.smsAlerts.forEach(s => window.globalState.notifications.unshift(s));
      if (typeof renderSmsLogs === 'function') renderSmsLogs(window.globalState.notifications);
    }

    if (typeof logToSerial === 'function') logToSerial(`[ESCALATION_TRIGGER] Grace period expired! SMS dispatched to family.`, "error");
    showToast("Family SMS Sent", `Grace period ended for ${data.medicine.name}. Family contacted.`, "error");
  });

  // SMS Alert Dispatched
  socket.on('sms_alert_dispatched', (data) => {
    if (data.alerts) {
      data.alerts.forEach(s => window.globalState.notifications.unshift(s));
      if (typeof renderSmsLogs === 'function') renderSmsLogs(window.globalState.notifications);
    }
  });

  // Emergency SOS Triggered
  socket.on('emergency_sos_triggered', (data) => {
    console.log('🚨 EMERGENCY SOS TRIGGERED:', data);
    if (window.soundEngine && typeof window.soundEngine.playBuzzerSound === 'function') {
      window.soundEngine.playBuzzerSound();
    }
    showToast("EMERGENCY SOS ALERT", "SOS button triggered! Caregivers notified.", "error");

    if (data.alerts) {
      data.alerts.forEach(s => window.globalState.notifications.unshift(s));
      if (typeof renderSmsLogs === 'function') renderSmsLogs(window.globalState.notifications);
    }
  });

  // Medicines updated
  socket.on('medicines_updated', (medicines) => {
    window.globalState.medicines = medicines;
    if (typeof renderSeniorSchedule === 'function') renderSeniorSchedule(medicines);
    if (typeof renderMedicationsTable === 'function') renderMedicationsTable(medicines);
  });

  // Caregivers updated
  socket.on('caregivers_updated', (caregivers) => {
    window.globalState.caregivers = caregivers;
    if (typeof renderCaregiversList === 'function') renderCaregiversList(caregivers);
  });

  // Hardware buttons
  socket.on('box_physical_button_pressed', (data) => {
    if (window.soundEngine) {
      if (data.button === 'GREEN') window.soundEngine.playSuccessSound();
      else if (data.button === 'RED') window.soundEngine.playBuzzerSound();
    }
  });
}

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  loadInitialStateFromApi();
});
