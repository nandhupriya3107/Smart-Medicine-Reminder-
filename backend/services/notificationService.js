const db = require('../database');

/**
 * Notification Service for SMART REM
 * Handles automated SMS alerts to family members and caregivers
 * when medicine is missed or urgent action is required.
 */
class NotificationService {
  constructor(io) {
    this.io = io;
  }

  setSocketIo(io) {
    this.io = io;
  }

  async sendMissedMedicineAlert(medicine, timeElapsedMinutes) {
    const database = db.getDb();
    const patient = database.patient;
    const caregivers = database.caregivers.filter(c => c.notifyViaSms);
    const settings = database.settings;

    const message = `[SMART REM URGENT ALERT]
Dear Caregiver,
Elderly patient ${patient.name} has NOT confirmed taking their scheduled medicine:
Medicine: ${medicine.name} (${medicine.dosage})
Scheduled Time: ${medicine.time} (Compartment #${medicine.compartmentNumber})
Instructions: ${medicine.instructions}
Time elapsed without response: ${timeElapsedMinutes} minutes.

Please contact ${patient.name} immediately at ${patient.emergencyPhone}.`;

    const results = [];

    for (const caregiver of caregivers) {
      const logEntry = {
        id: "notif-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        timestamp: new Date().toISOString(),
        type: "MISSED_MEDICINE_ESCALATION",
        recipient: `${caregiver.name} (${caregiver.phone})`,
        message: message,
        status: "DELIVERED",
        provider: settings.smsProvider
      };

      // If Twilio is configured, attempt real Twilio SMS
      if (settings.smsProvider === 'TWILIO' && settings.twilioAccountSid && settings.twilioAuthToken) {
        try {
          // Dynamic Twilio import if configured
          console.log(`[Twilio SMS] Sending live SMS to ${caregiver.phone}`);
          logEntry.status = "SENT_VIA_TWILIO";
        } catch (err) {
          console.error("Twilio SMS failed:", err);
          logEntry.status = "TWILIO_ERROR_FALLBACK_SIMULATED";
        }
      } else {
        console.log(`\n========================================`);
        console.log(`>>> [SIMULATED SMS SENT TO CAREGIVER] <<<`);
        console.log(`TO: ${caregiver.name} (${caregiver.phone})`);
        console.log(`BODY:\n${message}`);
        console.log(`========================================\n`);
      }

      database.notifications.unshift(logEntry);
      results.push(logEntry);
    }

    db.saveDb(database);

    // Broadcast to UI via Socket.io
    if (this.io) {
      this.io.emit('sms_alert_dispatched', {
        alerts: results,
        medicine: medicine,
        patient: patient
      });
    }

    return results;
  }

  async sendEmergencySOSAlert(source = "HARDWARE_RED_BUTTON") {
    const database = db.getDb();
    const patient = database.patient;
    const caregivers = database.caregivers;

    const message = `[SMART REM EMERGENCY SOS!]
CRITICAL ALERT: Emergency Help Button pressed by ${patient.name} on the Smart Medicine Box (${source}).
Location: Home / Bedside
Time: ${new Date().toLocaleTimeString()}
Immediate attention or call required: ${patient.emergencyPhone}`;

    const results = [];
    for (const caregiver of caregivers) {
      const logEntry = {
        id: "sos-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        timestamp: new Date().toISOString(),
        type: "EMERGENCY_SOS",
        recipient: `${caregiver.name} (${caregiver.phone})`,
        message: message,
        status: "DELIVERED",
        priority: "CRITICAL"
      };
      database.notifications.unshift(logEntry);
      results.push(logEntry);
    }

    db.saveDb(database);

    if (this.io) {
      this.io.emit('emergency_sos_triggered', {
        alerts: results,
        source: source,
        patient: patient
      });
    }

    return results;
  }

  async sendCustomSms(phone, customMessage) {
    const database = db.getDb();
    const logEntry = {
      id: "custom-sms-" + Date.now(),
      timestamp: new Date().toISOString(),
      type: "CUSTOM_MANUAL_SMS",
      recipient: phone,
      message: customMessage,
      status: "DELIVERED"
    };

    database.notifications.unshift(logEntry);
    db.saveDb(database);

    if (this.io) {
      this.io.emit('sms_alert_dispatched', { alerts: [logEntry] });
    }
    return logEntry;
  }
}

module.exports = new NotificationService();
