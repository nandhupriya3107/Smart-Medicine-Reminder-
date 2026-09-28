# SMART REM - REST API & WebSocket Documentation

Base URL: `http://localhost:3000/api`

---

## 1. Patient Profile Endpoints

### `GET /api/patient`
Returns patient profile data.
- **Response**: `200 OK`
```json
{
  "name": "Grandfather Robert",
  "age": 76,
  "bloodGroup": "O+",
  "doctorName": "Dr. Arthur Vance",
  "emergencyPhone": "+1 (555) 234-5678",
  "allergies": "Penicillin"
}
```

### `PUT /api/patient`
Updates patient profile.

---

## 2. Medicine Schedules

### `GET /api/medicines`
Returns all active prescription schedules.

### `POST /api/medicines`
Adds a new medicine schedule.
- **Request Body**:
```json
{
  "name": "Metformin",
  "dosage": "500 mg - 1 Tablet",
  "time": "08:00",
  "mealTime": "After Food",
  "compartmentNumber": 1,
  "instructions": "Take with water",
  "pillCount": 30
}
```

### `DELETE /api/medicines/:id`
Deletes a medicine schedule.

---

## 3. Reminder & Action Endpoints

### `POST /api/reminders/trigger`
Triggers an immediate reminder for testing and demonstration.

### `POST /api/reminders/taken`
Confirms medicine intake.
- **Request Body**:
```json
{
  "medicineId": "med-1",
  "method": "MOBILE_APP"
}
```

### `POST /api/reminders/snooze`
Snoozes the current alarm.
- **Request Body**: `{"medicineId": "med-1", "minutes": 5}`

### `POST /api/reminders/sos`
Triggers immediate emergency SOS and SMS alert to family members.

---

## 4. Hardware IoT Endpoints (ESP32 & ESP32-CAM)

### `GET /api/box/status`
Returns live state of the physical box.

### `POST /api/box/heartbeat`
Called periodically by ESP32 to check for pending reminders and report online status.

### `POST /api/box/action`
Sends physical button or sensor events from the box:
- `GREEN_BUTTON_PRESSED`
- `RED_BUTTON_PRESSED`
- `LID_OPENED`
- `LID_CLOSED`

### `POST /api/box/verify-pill`
Uploads base64 compartment snapshot from ESP32-CAM for computer vision verification.
- **Request Body**:
```json
{
  "imageData": "data:image/jpeg;base64,...",
  "compartmentNumber": 1
}
```
- **Response**:
```json
{
  "success": true,
  "verification": {
    "pillRemoved": true,
    "confidence": 96.0,
    "status": "VERIFIED_REMOVED",
    "details": "Compartment #1 verified: Tablet removed successfully."
  }
}
```

---

## 5. WebSockets Events (Socket.io)

| Event Name | Direction | Description |
|---|---|---|
| `medication_alarm_start` | Server -> Client | Broadcasts when a scheduled medicine reminder fires |
| `medication_taken_confirmed` | Server -> Client | Broadcasts when intake is confirmed |
| `medication_alarm_escalated` | Server -> Client | Broadcasts when grace period ends and SMS is sent |
| `emergency_sos_triggered` | Server -> Client | Broadcasts when Red Button / SOS is triggered |
| `box_lid_state_changed` | Server -> Client | Broadcasts lid open / close transitions |
