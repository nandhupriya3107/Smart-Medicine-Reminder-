const fs = require('fs');
const path = require('path');

let DB_FILE = path.join(__dirname, 'data', 'smart_rem_db.json');

// If in read-only environment like Vercel serverless, use /tmp/
if (process.env.VERCEL) {
  try {
    DB_FILE = path.join('/tmp', 'smart_rem_db.json');
  } catch (e) {
    // fallback
  }
}

// Ensure data directory exists
try {
  const dataDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch (e) {
  console.warn("Notice: Using memory fallback for db directory initialization");
}

// Initial seed data
const initialData = {
  patient: {
    name: "Grandfather Robert",
    age: 76,
    bloodGroup: "O+",
    doctorName: "Dr. Arthur Vance",
    emergencyPhone: "+1 (555) 234-5678",
    allergies: "Penicillin",
    notes: "Requires loud reminders and voice assistance."
  },
  medicines: [
    {
      id: "med-1",
      name: "Metformin (Diabetes)",
      dosage: "500 mg - 1 Tablet",
      time: "08:00",
      mealTime: "After Food",
      compartmentNumber: 1,
      instructions: "Take with a glass of warm water after breakfast.",
      color: "#3b82f6",
      active: true,
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      pillCount: 28,
      refillThreshold: 5
    },
    {
      id: "med-2",
      name: "Amlodipine (Blood Pressure)",
      dosage: "5 mg - 1 Tablet",
      time: "13:00",
      mealTime: "After Lunch",
      compartmentNumber: 2,
      instructions: "Maintain regular timing every afternoon.",
      color: "#10b981",
      active: true,
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      pillCount: 14,
      refillThreshold: 4
    },
    {
      id: "med-3",
      name: "Atorvastatin (Cholesterol)",
      dosage: "20 mg - 1 Tablet",
      time: "20:00",
      mealTime: "After Dinner",
      compartmentNumber: 3,
      instructions: "Take at bedtime with water.",
      color: "#8b5cf6",
      active: true,
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      pillCount: 21,
      refillThreshold: 5
    },
    {
      id: "med-4",
      name: "Vitamin D3 (Bone Health)",
      dosage: "1000 IU - 1 Capsule",
      time: "09:30",
      mealTime: "With Breakfast",
      compartmentNumber: 4,
      instructions: "Weekly Sunday supplement.",
      color: "#f59e0b",
      active: true,
      days: ["Sun"],
      pillCount: 8,
      refillThreshold: 2
    }
  ],
  caregivers: [
    {
      id: "cg-1",
      name: "Sarah Jenkins (Daughter)",
      relationship: "Daughter / Primary Caregiver",
      phone: "+1 (555) 345-6789",
      email: "sarah.jenkins@example.com",
      notifyViaSms: true,
      notifyViaCall: true,
      priority: 1
    },
    {
      id: "cg-2",
      name: "David Jenkins (Son)",
      relationship: "Son / Secondary Caregiver",
      phone: "+1 (555) 789-0123",
      email: "david.jenkins@example.com",
      notifyViaSms: true,
      notifyViaCall: false,
      priority: 2
    },
    {
      id: "cg-3",
      name: "Nurse Rachel Adams",
      relationship: "Home Healthcare Nurse",
      phone: "+1 (555) 901-2345",
      email: "rachel.adams@healthcare.org",
      notifyViaSms: true,
      notifyViaCall: false,
      priority: 3
    }
  ],
  logs: [
    {
      id: "log-1",
      medicineId: "med-1",
      medicineName: "Metformin (Diabetes)",
      scheduledTime: "08:00",
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      actualTime: "08:04:12",
      status: "TAKEN",
      method: "BOX_GREEN_BUTTON",
      cameraVerificationStatus: "VERIFIED",
      notes: "Tablet removed from compartment 1 on schedule."
    },
    {
      id: "log-2",
      medicineId: "med-2",
      medicineName: "Amlodipine (Blood Pressure)",
      scheduledTime: "13:00",
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      actualTime: "13:02:45",
      status: "TAKEN",
      method: "MOBILE_APP",
      cameraVerificationStatus: "VERIFIED",
      notes: "Confirmed via Mobile App."
    },
    {
      id: "log-3",
      medicineId: "med-3",
      medicineName: "Atorvastatin (Cholesterol)",
      scheduledTime: "20:00",
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      actualTime: "20:18:30",
      status: "TAKEN",
      method: "BOX_GREEN_BUTTON",
      cameraVerificationStatus: "VERIFIED",
      notes: "Taken after 18 minutes warning reminder."
    }
  ],
  notifications: [
    {
      id: "notif-1",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      type: "SYSTEM_INIT",
      recipient: "System Log",
      message: "Smart Medicine Reminder Box online and synced with RTC time.",
      status: "DELIVERED"
    }
  ],
  settings: {
    gracePeriodMinutes: 10,
    voiceRemindersEnabled: true,
    alarmSound: "melodic_chime",
    smsAlertsEnabled: true,
    cameraVerificationEnabled: true,
    smsProvider: "SIMULATED", // SIMULATED, TWILIO, FAST2SMS
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioFromNumber: "",
    fast2smsApiKey: "",
    boxId: "SMART-BOX-001",
    compartmentCount: 4
  },
  boxState: {
    online: true,
    lastHeartbeat: new Date().toISOString(),
    activeAlarm: null, // null or { medicineId, medicineName, compartment, triggeredAt, expiryAt }
    lidOpen: false,
    lastImage: null,
    lastVerificationResult: null
  }
};

let inMemoryCache = JSON.parse(JSON.stringify(initialData));

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
      } catch (err) {
        // Read-only filesystem
      }
      return inMemoryCache;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    inMemoryCache = JSON.parse(data);
    return inMemoryCache;
  } catch (err) {
    return inMemoryCache;
  }
}

function writeDb(data) {
  inMemoryCache = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    return true; // Memory saved
  }
}

module.exports = {
  getDb: readDb,
  saveDb: writeDb,
  getMedicines: () => readDb().medicines,
  getLogs: () => readDb().logs,
  getCaregivers: () => readDb().caregivers,
  getSettings: () => readDb().settings,
  getBoxState: () => readDb().boxState,
  getPatient: () => readDb().patient
};
