const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const db = require('./database');
const scheduler = require('./services/schedulerService');
const notificationService = require('./services/notificationService');
const visionService = require('./services/visionService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize scheduler with Socket.io
scheduler.init(io);

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// 1. Patient Profile
app.get('/api/patient', (req, res) => {
  res.json(db.getPatient());
});

app.put('/api/patient', (req, res) => {
  const database = db.getDb();
  database.patient = { ...database.patient, ...req.body };
  db.saveDb(database);
  io.emit('patient_updated', database.patient);
  res.json({ success: true, patient: database.patient });
});

// 2. Medicines Schedule
app.get('/api/medicines', (req, res) => {
  res.json(db.getMedicines());
});

app.post('/api/medicines', (req, res) => {
  const database = db.getDb();
  const newMed = {
    id: 'med-' + Date.now(),
    name: req.body.name || 'New Medicine',
    dosage: req.body.dosage || '1 Tablet',
    time: req.body.time || '08:00',
    mealTime: req.body.mealTime || 'After Food',
    compartmentNumber: parseInt(req.body.compartmentNumber) || 1,
    instructions: req.body.instructions || '',
    color: req.body.color || '#3b82f6',
    active: req.body.active !== undefined ? req.body.active : true,
    days: req.body.days || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    pillCount: parseInt(req.body.pillCount) || 30,
    refillThreshold: parseInt(req.body.refillThreshold) || 5
  };
  database.medicines.push(newMed);
  db.saveDb(database);
  io.emit('medicines_updated', database.medicines);
  res.status(201).json(newMed);
});

app.put('/api/medicines/:id', (req, res) => {
  const database = db.getDb();
  const index = database.medicines.findIndex(m => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Medicine not found' });

  database.medicines[index] = { ...database.medicines[index], ...req.body };
  db.saveDb(database);
  io.emit('medicines_updated', database.medicines);
  res.json(database.medicines[index]);
});

app.delete('/api/medicines/:id', (req, res) => {
  const database = db.getDb();
  database.medicines = database.medicines.filter(m => m.id !== req.params.id);
  db.saveDb(database);
  io.emit('medicines_updated', database.medicines);
  res.json({ success: true });
});

// 3. Reminder Actions (Taken, Snooze, Manual Trigger, SOS)
app.post('/api/reminders/trigger', (req, res) => {
  const { medicineId } = req.body;
  const database = db.getDb();
  const medicine = database.medicines.find(m => m.id === medicineId) || database.medicines[0];
  if (!medicine) return res.status(404).json({ error: 'No medicine found to trigger' });

  const alarm = scheduler.triggerReminder(medicine, true);
  res.json({ success: true, alarm });
});

app.post('/api/reminders/taken', (req, res) => {
  const { medicineId, method = "MOBILE_APP", verificationDetails = null } = req.body;
  const result = scheduler.confirmTaken(medicineId, method, verificationDetails);
  res.json(result);
});

app.post('/api/reminders/snooze', (req, res) => {
  const { medicineId, minutes = 5 } = req.body;
  const result = scheduler.snoozeReminder(medicineId, minutes);
  res.json(result);
});

app.post('/api/reminders/decline', (req, res) => {
  const { medicineId, reason } = req.body;
  const result = scheduler.markMissed(medicineId, reason);
  res.json(result);
});

app.post('/api/reminders/sos', async (req, res) => {
  const { source = "MOBILE_APP_SOS" } = req.body;
  const alerts = await notificationService.sendEmergencySOSAlert(source);
  res.json({ success: true, alerts });
});

// 4. Logs & Compliance Statistics
app.get('/api/logs', (req, res) => {
  const logs = db.getLogs();
  const total = logs.length;
  const takenCount = logs.filter(l => l.status === 'TAKEN').length;
  const missedCount = logs.filter(l => l.status === 'MISSED').length;
  const complianceRate = total > 0 ? Math.round((takenCount / total) * 100) : 100;

  res.json({
    logs,
    stats: {
      total,
      takenCount,
      missedCount,
      complianceRate
    }
  });
});

// 5. Caregivers
app.get('/api/caregivers', (req, res) => {
  res.json(db.getCaregivers());
});

app.post('/api/caregivers', (req, res) => {
  const database = db.getDb();
  const newCaregiver = {
    id: 'cg-' + Date.now(),
    name: req.body.name || 'Caregiver',
    relationship: req.body.relationship || 'Family Member',
    phone: req.body.phone || '',
    email: req.body.email || '',
    notifyViaSms: req.body.notifyViaSms !== undefined ? req.body.notifyViaSms : true,
    notifyViaCall: !!req.body.notifyViaCall,
    priority: parseInt(req.body.priority) || database.caregivers.length + 1
  };
  database.caregivers.push(newCaregiver);
  db.saveDb(database);
  io.emit('caregivers_updated', database.caregivers);
  res.status(201).json(newCaregiver);
});

app.delete('/api/caregivers/:id', (req, res) => {
  const database = db.getDb();
  database.caregivers = database.caregivers.filter(c => c.id !== req.params.id);
  db.saveDb(database);
  io.emit('caregivers_updated', database.caregivers);
  res.json({ success: true });
});

// 6. Notifications History (SMS Inbox)
app.get('/api/notifications', (req, res) => {
  const database = db.getDb();
  res.json(database.notifications || []);
});

// 7. System Settings
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  const database = db.getDb();
  database.settings = { ...database.settings, ...req.body };
  db.saveDb(database);
  io.emit('settings_updated', database.settings);
  res.json(database.settings);
});

// 8. Hardware Smart Box IoT Endpoints (For ESP32 / ESP32-CAM / Arduino)
app.get('/api/box/status', (req, res) => {
  const database = db.getDb();
  const nextMedicine = database.medicines.find(m => m.active);
  res.json({
    ...database.boxState,
    currentTime: new Date().toISOString(),
    nextMedicine: nextMedicine || null,
    settings: database.settings
  });
});

app.post('/api/box/heartbeat', (req, res) => {
  const database = db.getDb();
  database.boxState.online = true;
  database.boxState.lastHeartbeat = new Date().toISOString();
  db.saveDb(database);
  io.emit('box_status_updated', database.boxState);
  res.json({
    status: 'ACK',
    activeAlarm: database.boxState.activeAlarm,
    time: new Date().toLocaleTimeString('en-US', { hour12: false })
  });
});

app.post('/api/box/action', (req, res) => {
  const { action, compartmentNumber } = req.body;
  const database = db.getDb();

  console.log(`[Hardware Event] Action: ${action} | Compartment: ${compartmentNumber || 'N/A'}`);

  if (action === 'GREEN_BUTTON_PRESSED') {
    // Green Button pressed on box
    const result = scheduler.confirmTaken(null, "BOX_GREEN_BUTTON");
    io.emit('box_physical_button_pressed', { button: 'GREEN', result });
    return res.json({ success: true, action: 'CONFIRMED_TAKEN', result });
  }

  if (action === 'RED_BUTTON_PRESSED') {
    // Red Button pressed on box -> Trigger SOS or Decline
    notificationService.sendEmergencySOSAlert("BOX_PHYSICAL_RED_BUTTON");
    io.emit('box_physical_button_pressed', { button: 'RED' });
    return res.json({ success: true, action: 'SOS_TRIGGERED' });
  }

  if (action === 'LID_OPENED') {
    database.boxState.lidOpen = true;
    db.saveDb(database);
    io.emit('box_lid_state_changed', { lidOpen: true });
    return res.json({ success: true, lidOpen: true });
  }

  if (action === 'LID_CLOSED') {
    database.boxState.lidOpen = false;
    db.saveDb(database);
    io.emit('box_lid_state_changed', { lidOpen: false });
    return res.json({ success: true, lidOpen: false });
  }

  res.json({ success: true, action: 'PROCESSED' });
});

// 9. Camera Verification Endpoint (ESP32-CAM uploads image)
app.post('/api/box/verify-pill', async (req, res) => {
  try {
    const { imageData, compartmentNumber = 1, forceResult } = req.body;
    const verification = await visionService.verifyPillRemoval({
      imageData,
      compartmentNumber,
      forceResult
    });

    const database = db.getDb();
    database.boxState.lastVerificationResult = verification;
    db.saveDb(database);

    // If verified taken, automatically confirm medication taken
    if (verification.pillRemoved) {
      scheduler.confirmTaken(null, "BOX_CAMERA_CV", verification);
    } else {
      // Pill was left behind: warn caregiver!
      const activeAlarm = database.boxState.activeAlarm;
      const med = activeAlarm ? activeAlarm.medicine : database.medicines[0];
      notificationService.sendCustomSms(
        database.patient.emergencyPhone,
        `[SMART REM CAMERA ALERT] Camera inspection detected tablet was NOT removed from Compartment #${compartmentNumber} for ${med.name}. Please check on ${database.patient.name}.`
      );
    }

    io.emit('camera_verification_result', verification);
    res.json({ success: true, verification });
  } catch (err) {
    console.error("Camera verification error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Socket.io Connection
io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);

  // Send initial state
  socket.emit('initial_state', {
    patient: db.getPatient(),
    medicines: db.getMedicines(),
    caregivers: db.getCaregivers(),
    settings: db.getSettings(),
    boxState: db.getBoxState(),
    logs: db.getLogs(),
    notifications: db.getDb().notifications
  });

  socket.on('disconnect', () => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   SMART REM IoT SERVER                         ║
║      Medicine Reminder & Monitoring System for Elderly         ║
╠════════════════════════════════════════════════════════════════╣
║  🌐 Web Application : http://localhost:${PORT}                   ║
║  📡 REST API Base   : http://localhost:${PORT}/api               ║
║  🔌 WebSocket Hub   : Connected (Port ${PORT})                   ║
║  🤖 AI Pill Vision  : Active & Ready                          ║
║  📱 SMS Escalation  : Active (Grace Period Escalation)        ║
╚════════════════════════════════════════════════════════════════╝
`);
});
