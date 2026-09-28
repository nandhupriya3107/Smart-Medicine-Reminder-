const db = require('../database');
const notificationService = require('./notificationService');

class SchedulerService {
  constructor() {
    this.io = null;
    this.checkInterval = null;
    this.activeAlarms = new Map(); // medicineId -> { medicine, triggeredAt, timeoutHandle, status }
    this.lastTriggeredMinute = "";
  }

  init(io) {
    this.io = io;
    notificationService.setSocketIo(io);
    console.log("[Scheduler] Initializing Real-Time Medicine Scheduler...");

    // Check every 5 seconds for scheduled medications
    this.checkInterval = setInterval(() => {
      this.checkSchedules();
    }, 5000);
  }

  checkSchedules() {
    const database = db.getDb();
    const medicines = database.medicines.filter(m => m.active);
    const now = new Date();
    
    // Format HH:MM in 24-hr format
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentDay = dayNames[now.getDay()];

    // Prevent re-triggering multiple times in the same minute
    if (this.lastTriggeredMinute === currentTimeStr) {
      return;
    }

    medicines.forEach(medicine => {
      // Check if scheduled for today and matching current time
      if (medicine.days && medicine.days.includes(currentDay) && medicine.time === currentTimeStr) {
        if (!this.activeAlarms.has(medicine.id)) {
          console.log(`[Scheduler] 🔔 TIME MATCH: Triggering reminder for ${medicine.name} at ${currentTimeStr}`);
          this.triggerReminder(medicine);
        }
      }
    });

    this.lastTriggeredMinute = currentTimeStr;
  }

  triggerReminder(medicine, isManualTest = false) {
    const database = db.getDb();
    const gracePeriodMinutes = database.settings.gracePeriodMinutes || 10;
    const now = new Date();
    const expiryTime = new Date(now.getTime() + gracePeriodMinutes * 60 * 1000);

    const alarmData = {
      medicineId: medicine.id,
      medicine: medicine,
      triggeredAt: now.toISOString(),
      expiresAt: expiryTime.toISOString(),
      gracePeriodMinutes: gracePeriodMinutes,
      status: "ACTIVE_REMINDER",
      isManualTest: isManualTest
    };

    // Update box state in DB
    database.boxState.activeAlarm = alarmData;
    db.saveDb(database);

    // Set timeout to escalate to Caregivers via SMS if no response
    const timeoutMs = gracePeriodMinutes * 60 * 1000;
    const timeoutHandle = setTimeout(async () => {
      console.log(`[Scheduler] ⚠️ GRACE PERIOD EXPIRED for ${medicine.name}! Escalating to SMS...`);
      await this.handleGracePeriodExpiry(medicine.id);
    }, timeoutMs);

    this.activeAlarms.set(medicine.id, {
      ...alarmData,
      timeoutHandle
    });

    // Broadcast reminder to Senior UI, Caregiver Portal & Smart Box via WebSockets
    if (this.io) {
      this.io.emit('medication_alarm_start', {
        alarm: alarmData,
        message: `It's time to take ${medicine.name}! Compartment #${medicine.compartmentNumber}.`
      });
    }

    return alarmData;
  }

  async handleGracePeriodExpiry(medicineId) {
    const alarmEntry = this.activeAlarms.get(medicineId);
    if (!alarmEntry || alarmEntry.status !== "ACTIVE_REMINDER") return;

    const database = db.getDb();
    const medicine = alarmEntry.medicine;

    // Mark as missed in alarm tracker
    alarmEntry.status = "ESCALATED_MISSED";
    this.activeAlarms.delete(medicineId);

    // Update database logs
    const logEntry = {
      id: "log-" + Date.now(),
      medicineId: medicine.id,
      medicineName: medicine.name,
      scheduledTime: medicine.time,
      date: new Date().toISOString().split('T')[0],
      actualTime: new Date().toLocaleTimeString(),
      status: "MISSED",
      method: "AUTO_TIMEOUT_NO_RESPONSE",
      cameraVerificationStatus: "FAILED",
      notes: `Elderly person did not confirm within ${alarmEntry.gracePeriodMinutes} mins. Automated SMS dispatched to family.`
    };

    database.logs.unshift(logEntry);
    database.boxState.activeAlarm = null;
    db.saveDb(database);

    // Dispatch SMS to family
    const smsResults = await notificationService.sendMissedMedicineAlert(medicine, alarmEntry.gracePeriodMinutes);

    // Broadcast escalation event
    if (this.io) {
      this.io.emit('medication_alarm_escalated', {
        medicine: medicine,
        log: logEntry,
        smsAlerts: smsResults
      });
    }
  }

  confirmTaken(medicineId, method = "MOBILE_APP", verificationDetails = null) {
    const database = db.getDb();
    let medicine = database.medicines.find(m => m.id === medicineId);

    if (!medicine && database.boxState.activeAlarm) {
      medicine = database.boxState.activeAlarm.medicine;
      medicineId = medicine.id;
    }

    if (!medicine) {
      // Fallback first active medicine
      medicine = database.medicines[0];
      medicineId = medicine.id;
    }

    // Clear active alarm timer if running
    if (this.activeAlarms.has(medicineId)) {
      const active = this.activeAlarms.get(medicineId);
      if (active.timeoutHandle) clearTimeout(active.timeoutHandle);
      this.activeAlarms.delete(medicineId);
    }

    // Decrement pill count
    if (medicine.pillCount > 0) {
      medicine.pillCount -= 1;
    }

    // Add log
    const logEntry = {
      id: "log-" + Date.now(),
      medicineId: medicine.id,
      medicineName: medicine.name,
      scheduledTime: medicine.time || "Immediate",
      date: new Date().toISOString().split('T')[0],
      actualTime: new Date().toLocaleTimeString(),
      status: "TAKEN",
      method: method, // "MOBILE_APP", "BOX_GREEN_BUTTON", "BOX_CAMERA_CV"
      cameraVerificationStatus: verificationDetails ? (verificationDetails.pillRemoved ? "VERIFIED" : "WARNING") : "VERIFIED",
      notes: verificationDetails ? verificationDetails.details : `Confirmed taken via ${method}.`
    };

    database.logs.unshift(logEntry);
    database.boxState.activeAlarm = null;
    database.boxState.lastPillVerified = new Date().toISOString();
    db.saveDb(database);

    console.log(`[Scheduler] ✅ Medication TAKEN: ${medicine.name} via ${method}`);

    // Broadcast to UI and Hardware Box
    if (this.io) {
      this.io.emit('medication_taken_confirmed', {
        medicine: medicine,
        log: logEntry,
        method: method,
        verification: verificationDetails
      });
    }

    return { success: true, log: logEntry, medicine };
  }

  snoozeReminder(medicineId, minutes = 5) {
    if (this.activeAlarms.has(medicineId)) {
      const active = this.activeAlarms.get(medicineId);
      if (active.timeoutHandle) clearTimeout(active.timeoutHandle);
      this.activeAlarms.delete(medicineId);
    }

    const database = db.getDb();
    database.boxState.activeAlarm = null;
    db.saveDb(database);

    const medicine = database.medicines.find(m => m.id === medicineId) || database.medicines[0];

    // Re-trigger after snooze minutes
    setTimeout(() => {
      console.log(`[Scheduler] ⏰ Snooze timer finished for ${medicine.name}. Re-triggering alarm!`);
      this.triggerReminder(medicine, true);
    }, minutes * 60 * 1000);

    if (this.io) {
      this.io.emit('medication_snoozed', {
        medicine: medicine,
        snoozeMinutes: minutes
      });
    }

    return { success: true, message: `Reminder snoozed for ${minutes} minutes.` };
  }

  markMissed(medicineId, reason = "Elderly indicated unable to take") {
    const database = db.getDb();
    const medicine = database.medicines.find(m => m.id === medicineId) || database.medicines[0];

    if (this.activeAlarms.has(medicineId)) {
      const active = this.activeAlarms.get(medicineId);
      if (active.timeoutHandle) clearTimeout(active.timeoutHandle);
      this.activeAlarms.delete(medicineId);
    }

    const logEntry = {
      id: "log-" + Date.now(),
      medicineId: medicine.id,
      medicineName: medicine.name,
      scheduledTime: medicine.time || "Immediate",
      date: new Date().toISOString().split('T')[0],
      actualTime: new Date().toLocaleTimeString(),
      status: "SKIPPED_BY_USER",
      method: "RED_BUTTON_DECLINE",
      cameraVerificationStatus: "NOT_USED",
      notes: reason
    };

    database.logs.unshift(logEntry);
    database.boxState.activeAlarm = null;
    db.saveDb(database);

    // Notify caregivers of manual skip/refusal
    notificationService.sendCustomSms(
      database.patient.emergencyPhone,
      `[SMART REM NOTICE] ${database.patient.name} marked ${medicine.name} as skipped/not taken (${reason}).`
    );

    if (this.io) {
      this.io.emit('medication_declined', {
        medicine: medicine,
        log: logEntry
      });
    }

    return { success: true, log: logEntry };
  }
}

module.exports = new SchedulerService();
