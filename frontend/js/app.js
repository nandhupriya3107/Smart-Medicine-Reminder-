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

// Connect to Socket.io
const socket = io();

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
  document.getElementById('btnNavSenior').classList.toggle('active', viewName === 'senior');
  document.getElementById('btnNavBox').classList.toggle('active', viewName === 'box');
  document.getElementById('btnNavCaregiver').classList.toggle('active', viewName === 'caregiver');

  // Toggle view panels
  document.getElementById('viewSenior').classList.toggle('active', viewName === 'senior');
  document.getElementById('viewBox').classList.toggle('active', viewName === 'box');
  document.getElementById('viewCaregiver').classList.toggle('active', viewName === 'caregiver');
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
// WEBSOCKET REAL-TIME EVENT HANDLERS
// --------------------------------------------------------------------------

socket.on('connect', () => {
  console.log('Connected to SMART REM IoT Backend!');
  const badge = document.getElementById('connectionBadge');
  if (badge) {
    badge.className = 'status-badge status-online';
    badge.innerHTML = '<span class="dot"></span> Online';
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected from SMART REM Backend.');
  const badge = document.getElementById('connectionBadge');
  if (badge) {
    badge.className = 'status-badge';
    badge.style.background = '#fee2e2';
    badge.style.color = '#dc2626';
    badge.innerHTML = 'Offline';
  }
});

socket.on('initial_state', (state) => {
  window.globalState = { ...window.globalState, ...state };
  console.log('Received initial system state:', state);

  // Initialize sub-views
  initSeniorView(state);
  initBoxSimulator(state);
  initCaregiverView(state);
});

// Alarm Start Event (Triggered by clock scheduler or test button)
socket.on('medication_alarm_start', (data) => {
  console.log('🚨 Medication Alarm Triggered:', data);
  showActiveAlarm(data.alarm);
  setBoxAlarmState(true, data.alarm.medicine);
  logToSerial(`[SCHEDULE_MATCH] Active Reminder started for ${data.alarm.medicine.name}. Grace timer active.`, "warn");
  showToast("Medicine Time!", `Time to take ${data.alarm.medicine.name}`, "warning");
});

// Medication Taken Confirmed (From app button, green button, or camera)
socket.on('medication_taken_confirmed', (data) => {
  console.log('✅ Medication Intake Confirmed:', data);
  hideActiveAlarm();
  setBoxAlarmState(false);
  
  // Update state logs
  if (data.log) {
    window.globalState.logs.unshift(data.log);
    renderIntakeHistory(window.globalState.logs);
    updateComplianceStats(window.globalState.logs);
  }

  logToSerial(`[INTAKE_SUCCESS] Medicine intake confirmed via ${data.method}.`, "success");
});

// Reminder Snoozed
socket.on('medication_snoozed', (data) => {
  hideActiveAlarm();
  setBoxAlarmState(false);
  logToSerial(`[SNOOZE] Reminder snoozed for ${data.snoozeMinutes} mins.`, "info");
});

// Alarm Escalation to Family (Grace Period Expired)
socket.on('medication_alarm_escalated', (data) => {
  console.log('⚠️ Reminder Escalated to Family SMS:', data);
  window.soundEngine.speakText("Attention: Medication confirmation window has elapsed. Family members have been notified.");
  
  if (data.log) {
    window.globalState.logs.unshift(data.log);
    renderIntakeHistory(window.globalState.logs);
    updateComplianceStats(window.globalState.logs);
  }

  if (data.smsAlerts) {
    data.smsAlerts.forEach(s => window.globalState.notifications.unshift(s));
    renderSmsLogs(window.globalState.notifications);
  }

  logToSerial(`[ESCALATION_TRIGGER] Grace period expired! SMS dispatched to family.`, "error");
  showToast("Family SMS Sent", `Grace period ended for ${data.medicine.name}. Family contacted.`, "error");
});

// SMS Alert Dispatched (Broadcast when any SMS is generated)
socket.on('sms_alert_dispatched', (data) => {
  if (data.alerts) {
    data.alerts.forEach(s => window.globalState.notifications.unshift(s));
    renderSmsLogs(window.globalState.notifications);
  }
});

// Emergency SOS Triggered
socket.on('emergency_sos_triggered', (data) => {
  console.log('🚨 EMERGENCY SOS TRIGGERED:', data);
  window.soundEngine.playBuzzerSound();
  showToast("EMERGENCY SOS ALERT", "SOS button triggered! Caregivers notified.", "error");

  if (data.alerts) {
    data.alerts.forEach(s => window.globalState.notifications.unshift(s));
    renderSmsLogs(window.globalState.notifications);
  }
});

// Medicines updated
socket.on('medicines_updated', (medicines) => {
  window.globalState.medicines = medicines;
  renderSeniorSchedule(medicines);
  renderMedicationsTable(medicines);
});

// Caregivers updated
socket.on('caregivers_updated', (caregivers) => {
  window.globalState.caregivers = caregivers;
  renderCaregiversList(caregivers);
});

// Hardware buttons
socket.on('box_physical_button_pressed', (data) => {
  if (data.button === 'GREEN') {
    window.soundEngine.playSuccessSound();
  } else if (data.button === 'RED') {
    window.soundEngine.playBuzzerSound();
  }
});

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  startClock();
});
