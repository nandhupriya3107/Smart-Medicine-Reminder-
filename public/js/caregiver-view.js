/**
 * Caregiver & Family Dashboard Controller
 */

function initCaregiverView(data) {
  renderPatientStats(data.patient);
  renderMedicationsTable(data.medicines);
  renderCaregiversList(data.caregivers);
  renderSmsLogs(data.notifications);
  renderIntakeHistory(data.logs);
  updateComplianceStats(data.logs);
}

function renderPatientStats(patient) {
  if (!patient) return;
  const nameEl = document.getElementById('caregiverPatientName');
  if (nameEl) nameEl.textContent = patient.name;
}

function updateComplianceStats(logs) {
  if (!logs) return;
  const total = logs.length;
  const taken = logs.filter(l => l.status === 'TAKEN').length;
  const missed = logs.filter(l => l.status === 'MISSED' || l.status === 'SKIPPED_BY_USER').length;
  const rate = total > 0 ? Math.round((taken / total) * 100) : 100;

  const rateEl = document.getElementById('statAdherenceRate');
  const takenEl = document.getElementById('statTakenCount');
  const missedEl = document.getElementById('statMissedCount');

  if (rateEl) rateEl.textContent = `${rate}%`;
  if (takenEl) takenEl.textContent = taken;
  if (missedEl) missedEl.textContent = missed;
}

function renderMedicationsTable(medicines) {
  const tbody = document.getElementById('caregiverMedTableBody');
  if (!tbody) return;

  if (!medicines || medicines.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: #94a3b8; padding: 2rem;">No medicines configured yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = medicines.map(med => {
    const isLow = med.pillCount <= (med.refillThreshold || 5);
    return `
      <tr>
        <td>
          <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${med.color}; margin-right:6px;"></span>
          <strong>Compartment #${med.compartmentNumber}</strong>
        </td>
        <td>
          <div style="font-weight:700; color:#1e293b;">${med.name}</div>
          <div style="font-size:0.8rem; color:#64748b;">${med.dosage}</div>
        </td>
        <td>
          <span style="font-family:monospace; font-weight:700;">${med.time}</span>
          <div style="font-size:0.75rem; color:#64748b;">${med.mealTime}</div>
        </td>
        <td>
          <span class="pill-count-badge ${isLow ? 'low' : ''}">
            ${med.pillCount} Pills ${isLow ? '⚠️ Refill' : ''}
          </span>
        </td>
        <td>
          <button class="action-btn-sm" onclick="editMedication('${med.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="action-btn-sm delete" onclick="deleteMedication('${med.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCaregiversList(caregivers) {
  const container = document.getElementById('caregiversListContainer');
  if (!container) return;

  if (!caregivers || caregivers.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:#94a3b8;">No caregivers registered.</div>`;
    return;
  }

  container.innerHTML = caregivers.map(cg => `
    <div class="caregiver-card">
      <div class="caregiver-info">
        <h4>${cg.name}</h4>
        <p>${cg.relationship} • ${cg.phone}</p>
      </div>
      <div class="caregiver-badges">
        ${cg.notifyViaSms ? '<span class="badge-sms"><i class="fa-solid fa-check"></i> SMS Alerts</span>' : ''}
        <button class="action-btn-sm delete" onclick="deleteCaregiver('${cg.id}')" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function renderSmsLogs(notifications) {
  const container = document.getElementById('smsLogContainer');
  if (!container) return;

  if (!notifications || notifications.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:#94a3b8; padding: 1.5rem;">No SMS dispatches yet.</div>`;
    return;
  }

  container.innerHTML = notifications.slice(0, 10).map(n => {
    const isCritical = n.type === 'EMERGENCY_SOS' || n.type === 'MISSED_MEDICINE_ESCALATION';
    const timeStr = new Date(n.timestamp).toLocaleTimeString();
    return `
      <div class="sms-item ${isCritical ? 'critical' : ''}">
        <div class="sms-meta">
          <span><i class="fa-solid fa-comment-dots"></i> TO: ${n.recipient}</span>
          <span>${timeStr}</span>
        </div>
        <div class="sms-body">${n.message}</div>
      </div>
    `;
  }).join('');
}

function renderIntakeHistory(logs) {
  const container = document.getElementById('intakeHistoryContainer');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:#94a3b8; padding: 1.5rem;">No intake logs yet.</div>`;
    return;
  }

  container.innerHTML = logs.slice(0, 10).map(log => {
    const isTaken = log.status === 'TAKEN';
    return `
      <div class="history-item">
        <div class="history-left">
          <div class="history-status-icon ${isTaken ? 'status-taken' : 'status-missed'}">
            <i class="fa-solid ${isTaken ? 'fa-check' : 'fa-xmark'}"></i>
          </div>
          <div class="history-details">
            <h5>${log.medicineName}</h5>
            <span>${log.date} at ${log.actualTime} • Via: ${log.method || 'App'}</span>
          </div>
        </div>
        <div>
          <span style="font-size: 0.75rem; font-weight:700; color:${isTaken ? '#15803d' : '#dc2626'};">
            ${log.cameraVerificationStatus === 'VERIFIED' ? '📷 CAM VERIFIED' : log.status}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// Medication CRUD
function openAddMedicationModal() {
  document.getElementById('modalMedTitle').textContent = "Add New Medication";
  document.getElementById('formMedication').reset();
  document.getElementById('medFormId').value = "";
  openModal('modalMedication');
}

function editMedication(medId) {
  const med = window.globalState.medicines.find(m => m.id === medId);
  if (!med) return;

  document.getElementById('modalMedTitle').textContent = "Edit Medication";
  document.getElementById('medFormId').value = med.id;
  document.getElementById('medFormName').value = med.name;
  document.getElementById('medFormDosage').value = med.dosage;
  document.getElementById('medFormTime').value = med.time;
  document.getElementById('medFormMeal').value = med.mealTime;
  document.getElementById('medFormCompartment').value = med.compartmentNumber;
  document.getElementById('medFormCount').value = med.pillCount;
  document.getElementById('medFormColor').value = med.color || '#3b82f6';
  document.getElementById('medFormInstructions').value = med.instructions || '';

  openModal('modalMedication');
}

async function handleSaveMedication(event) {
  event.preventDefault();
  const id = document.getElementById('medFormId').value;
  const payload = {
    name: document.getElementById('medFormName').value,
    dosage: document.getElementById('medFormDosage').value,
    time: document.getElementById('medFormTime').value,
    mealTime: document.getElementById('medFormMeal').value,
    compartmentNumber: parseInt(document.getElementById('medFormCompartment').value),
    pillCount: parseInt(document.getElementById('medFormCount').value),
    color: document.getElementById('medFormColor').value,
    instructions: document.getElementById('medFormInstructions').value
  };

  try {
    if (id) {
      // Edit
      await fetch(`/api/medicines/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast("Medication Updated", "Prescription saved.", "success");
    } else {
      // Add
      await fetch('/api/medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast("Medication Added", "New medicine schedule active.", "success");
    }
    closeModal('modalMedication');
  } catch (err) {
    console.error(err);
  }
}

async function deleteMedication(medId) {
  if (!confirm("Are you sure you want to remove this medication schedule?")) return;
  try {
    await fetch(`/api/medicines/${medId}`, { method: 'DELETE' });
    showToast("Medication Deleted", "Schedule removed.", "info");
  } catch (err) {
    console.error(err);
  }
}

// Caregiver CRUD
function openAddCaregiverModal() {
  document.getElementById('formCaregiver').reset();
  openModal('modalCaregiver');
}

async function handleSaveCaregiver(event) {
  event.preventDefault();
  const payload = {
    name: document.getElementById('cgFormName').value,
    relationship: document.getElementById('cgFormRelation').value,
    phone: document.getElementById('cgFormPhone').value,
    email: document.getElementById('cgFormEmail').value,
    notifyViaSms: document.getElementById('cgFormSms').checked
  };

  try {
    await fetch('/api/caregivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    closeModal('modalCaregiver');
    showToast("Caregiver Added", "Emergency contact enrolled.", "success");
  } catch (err) {
    console.error(err);
  }
}

async function deleteCaregiver(id) {
  if (!confirm("Remove this caregiver from emergency alerts?")) return;
  try {
    await fetch(`/api/caregivers/${id}`, { method: 'DELETE' });
    showToast("Contact Removed", "Caregiver list updated.", "info");
  } catch (err) {
    console.error(err);
  }
}

async function sendTestSmsAlert() {
  try {
    const res = await fetch('/api/reminders/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: "CAREGIVER_TEST_DISPATCH" })
    });
    const data = await res.json();
    showToast("Test SMS Sent", "Alert dispatched to all enrolled caregiver numbers.", "success");
  } catch (err) {
    console.error(err);
  }
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    renderIntakeHistory(data.logs);
    updateComplianceStats(data.logs);
    showToast("Logs Refreshed", "Latest compliance data synchronized.", "info");
  } catch (err) {
    console.error(err);
  }
}
