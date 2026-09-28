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

// Initialize scheduler with Socket.io (if not serverless invocation)
if (!process.env.VERCEL) {
  scheduler.init(io);
}

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
  res.status(201).json({ success: true, medicine: newMed });
});

app.put('/api/medicines/:id', (req, res) => {
  const database = db.getDb();
  const index = database.medicines.findIndex(m => m.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Medicine not found' });
  }

  database.medicines[index] = { ...database.medicines[index], ...req.body };
  db.saveDb(database);
  io.emit('medicines_updated', database.medicines);
  res.json({ success: true, medicine: database.medicines[index] });
});

app.delete('/api/medicines/:id', (req, res) => {
  const database = db.getDb();
  database.medicines = database.medicines.filter(m => m.id !== req.params.id);
  db.saveDb(database);
  io.emit('medicines_updated', database.medicines);
  res.json({ success: true });
});

// 3. Confirm Medicine Intake (from Senior button, App button, or Physical Box)
app.post('/api/medicines/:id/take', (req, res) => {
  const { method, compartmentNumber } = req.body;
  const result = scheduler.confirmMedicineTaken(
    req.params.id, 
    method || 'APP_BUTTON', 
    compartmentNumber
  );

  if (result.success) {
    io.emit('medicine_taken', result.log);
    io.emit('box_state_changed', db.getBoxState());
    return res.json(result);
  } else {
    return res.status(400).json(result);
  }
});

// 4. Snooze Reminder
app.post('/api/medicines/:id/snooze', (req, res) => {
  const snoozeMinutes = req.body.minutes || 5;
  const result = scheduler.snoozeReminder(req.params.id, snoozeMinutes);
  io.emit('reminder_snoozed', { medicineId: req.params.id, snoozeMinutes });
  res.json(result);
});

// 5. Emergency SOS Alert
app.post('/api/emergency/sos', async (req, res) => {
  const { triggerSource, notes } = req.body;
  console.log(`🚨 [SOS] Triggered by ${triggerSource || 'Senior View'}`);

  const notif = await notificationService.sendEmergencySos({
    triggerSource: triggerSource || 'MANUAL_SOS',
    notes: notes || 'Emergency SOS button pressed by patient.'
  });

  io.emit('emergency_sos_triggered', notif);
  res.json({ success: true, notification: notif });
});

// 6. Caregiver Management
app.get('/api/caregivers', (req, res) => {
  res.json(db.getCaregivers());
});

app.post('/api/caregivers', (req, res) => {
  const database = db.getDb();
  const newCaregiver = {
    id: 'cg-' + Date.now(),
    name: req.body.name,
    relationship: req.body.relationship || 'Caregiver',
    phone: req.body.phone,
    email: req.body.email || '',
    notifyViaSms: req.body.notifyViaSms !== false,
    notifyViaCall: req.body.notifyViaCall || false,
    priority: parseInt(req.body.priority) || (database.caregivers.length + 1)
  };

  database.caregivers.push(newCaregiver);
  db.saveDb(database);
  io.emit('caregivers_updated', database.caregivers);
  res.status(201).json({ success: true, caregiver: newCaregiver });
});

app.put('/api/caregivers/:id', (req, res) => {
  const database = db.getDb();
  const index = database.caregivers.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Caregiver not found' });

  database.caregivers[index] = { ...database.caregivers[index], ...req.body };
  db.saveDb(database);
  io.emit('caregivers_updated', database.caregivers);
  res.json({ success: true, caregiver: database.caregivers[index] });
});

app.delete('/api/caregivers/:id', (req, res) => {
  const database = db.getDb();
  database.caregivers = database.caregivers.filter(c => c.id !== req.params.id);
  db.saveDb(database);
  io.emit('caregivers_updated', database.caregivers);
  res.json({ success: true });
});

// 7. Intake Logs & Compliance
app.get('/api/logs', (req, res) => {
  res.json(db.getLogs());
});

// 8. Notifications History
app.get('/api/notifications', (req, res) => {
  res.json(db.getDb().notifications || []);
});

// 9. System Settings
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  const database = db.getDb();
  database.settings = { ...database.settings, ...req.body };
  db.saveDb(database);
  io.emit('settings_updated', database.settings);
  res.json({ success: true, settings: database.settings });
});

// 10. Hardware & Digital Twin Box State
app.get('/api/box/state', (req, res) => {
  res.json(db.getBoxState());
});

// 11. ESP32 Microcontroller Endpoints
app.post('/api/box/heartbeat', (req, res) => {
  const database = db.getDb();
  database.boxState.online = true;
  database.boxState.lastHeartbeat = new Date().toISOString();
  db.saveDb(database);
  io.emit('box_heartbeat', database.boxState);
  res.json({ success: true, activeAlarm: database.boxState.activeAlarm });
});

// Hardware Lid Open / Close
app.post('/api/box/lid', (req, res) => {
  const { open, compartment } = req.body;
  const database = db.getDb();
  database.boxState.lidOpen = Boolean(open);
  db.saveDb(database);

  io.emit('box_lid_changed', { open: Boolean(open), compartment });
  res.json({ success: true, lidOpen: database.boxState.lidOpen });
});

// Hardware Button Press (Physical Green / Red button on box)
app.post('/api/box/button', (req, res) => {
  const { buttonColor, compartment } = req.body;
  console.log(`[Hardware] Physical Box Button Pressed: ${buttonColor} on Compartment ${compartment || 1}`);

  if (buttonColor === 'GREEN') {
    // Take medicine assigned to this compartment
    const meds = db.getMedicines();
    const activeAlarm = db.getBoxState().activeAlarm;
    let targetMed = null;

    if (activeAlarm) {
      targetMed = meds.find(m => m.id === activeAlarm.medicineId);
    } else if (compartment) {
      targetMed = meds.find(m => m.compartmentNumber === parseInt(compartment));
    }

    if (targetMed) {
      const result = scheduler.confirmMedicineTaken(targetMed.id, 'BOX_GREEN_BUTTON', targetMed.compartmentNumber);
      io.emit('medicine_taken', result.log);
      io.emit('box_state_changed', db.getBoxState());
      return res.json({ success: true, message: 'Intake confirmed via Physical Box Button.', result });
    } else {
      return res.json({ success: false, message: 'No active medicine mapped to this compartment.' });
    }
  } else if (buttonColor === 'RED') {
    // SOS / Skip trigger
    notificationService.sendEmergencySos({
      triggerSource: 'PHYSICAL_BOX_RED_BUTTON',
      notes: 'Red SOS Emergency Button pressed on physical Smart Medicine Box.'
    });
    return res.json({ success: true, message: 'SOS Triggered from Box.' });
  }

  res.status(400).json({ error: 'Unknown button color' });
});

// 12. ESP32-CAM / OpenCV Pill Verification Endpoint
app.post('/api/box/verify-camera', visionService.getUploadMiddleware().single('image'), async (req, res) => {
  try {
    const compartment = req.body.compartment || 1;
    let imageBase64 = null;

    if (req.file) {
      imageBase64 = req.file.buffer.toString('base64');
    } else if (req.body.imageBase64) {
      imageBase64 = req.body.imageBase64;
    }

    const verificationResult = await visionService.verifyPillTaken(imageBase64, compartment);
    
    // Broadcast camera verification result to live frontend
    io.emit('camera_verification_result', verificationResult);

    res.json({
      success: true,
      verification: verificationResult
    });
  } catch (error) {
    console.error("Camera verification error:", error);
    res.status(500).json({ error: 'Failed to process camera image' });
  }
});

// Test Reminder Dispatch (Simulate immediate trigger)
app.post('/api/test/trigger-reminder', (req, res) => {
  const { medicineId } = req.body;
  const meds = db.getMedicines();
  const med = meds.find(m => m.id === medicineId) || meds[0];

  if (!med) return res.status(404).json({ error: 'No medicine found' });

  scheduler.triggerReminder(med, true);
  res.json({ success: true, message: `Simulated trigger for ${med.name}` });
});

// Fallback to index.html for single-page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// WebSocket Connection Management
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

// Start Server if not serverless
if (!process.env.VERCEL) {
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
}

module.exports = app;
