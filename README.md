# SMART REM: Medicine Reminder System for Elderly People 💊👵👴

> An IoT & Computer Vision-Powered Smart Medicine Reminder, Monitoring, and Remote Caregiver Escalation System for Geriatric Healthcare.

![SMART REM System](https://img.shields.io/badge/Platform-ESP32%20%7C%20Node.js%20%7C%20WebSockets-blue?style=for-the-badge)
![AI Vision](https://img.shields.io/badge/AI%20Vision-OpenCV%20%7C%20ESP32--CAM-green?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Complete%20%26%20Ready-success?style=for-the-badge)

---

## 🌟 Key Highlights & Features

### 1. 📱 Senior-Friendly Mobile Reminder View
* **Accessible Visual Design**: Extra-large fonts, high-contrast buttons, and clutter-free interface designed specifically for elderly eyes.
* **Voice Assistant (TTS)**: Reads out medicine names, dosages, and instructions clearly in natural spoken language.
* **Melodic Audio Chimes**: Web Audio synthesized chime alarms that repeat until confirmed.
* **Simple One-Tap Confirmations**: Giant **Green "I HAVE TAKEN IT"** button, **Yellow "Snooze (5 Min)"** button, and **Red "Emergency SOS"** button.

### 2. 🤖 Smart Medicine Box (Physical IoT Device & Digital Twin)
* **ESP32 Microcontroller**: Coordinates real-time clock, OLED screen, buzzer, buttons, and cloud synchronization.
* **DS3231 RTC Module**: Ensures reliable offline schedule triggering without internet dependency.
* **0.96" I2C OLED Display (SSD1306)**: Shows medicine name, dose, compartment number, and countdown.
* **Physical Push Buttons**:
  * **Green Button**: Medicine taken confirmation with instant green LED confirmation.
  * **Red Button**: SOS emergency alert / skip indication.
* **ESP32-CAM Pill Verification Module**:
  * Snaps a photo of the compartment when the lid opens.
  * Uses computer vision / OpenCV contour analysis to verify whether the pill was removed.
  * Confirms with a **Green Tick Mark** or issues a **Red Warning** if the tablet was left inside.

### 3. 🚨 Automated Family & Caregiver SMS Escalation
* **Grace Period Countdown**: Configurable grace window (e.g., 10 minutes).
* If the senior does not confirm intake within this window, the system **automatically dispatches an urgent SMS alert** to enrolled family members with patient details, missed medicine name, dosage, and emergency contact number.

### 4. 📊 Caregiver & Family Control Hub
* Prescribed medicine manager (Add / Edit / Delete medications, meal relations, stock counters, compartment assignments).
* Live SMS dispatch history & live compliance rate charts.
* Interactive 3D/2D IoT Digital Twin simulator to test hardware box workflows in-browser without physical wires.

---

## 📁 Project Directory Structure

```
SMART REM/
├── backend/
│   ├── data/
│   │   └── smart_rem_db.json         # Database storage (Patients, Medicines, Logs, SMS)
│   ├── services/
│   │   ├── notificationService.js    # SMS & Caregiver Escalation Engine (Twilio / Simulator)
│   │   ├── schedulerService.js       # Real-time reminder scheduler & countdown timers
│   │   └── visionService.js          # Image analysis & camera verification handler
│   ├── server.js                     # Express REST API & Socket.io WebSocket server
│   └── package.json
├── frontend/
│   ├── css/
│   │   └── style.css                 # Accessible CSS for Senior UI & Box Simulator
│   ├── js/
│   │   ├── app.js                    # Global orchestrator & WebSockets
│   │   ├── audio.js                  # Web Audio chimes & Web Speech TTS
│   │   ├── senior-view.js            # Senior Citizen accessible mode
│   │   ├── box-simulator.js          # IoT Hardware Smart Box Digital Twin
│   │   └── caregiver-view.js         # Caregiver dashboard & medicine manager
│   └── index.html                    # Main responsive web application
├── firmware/
│   ├── esp32_smart_medicine_box/
│   │   └── esp32_smart_medicine_box.ino   # ESP32 master sketch (OLED, RTC, Buzzer, Buttons)
│   ├── esp32_cam_pill_monitor/
│   │   └── esp32_cam_pill_monitor.ino     # ESP32-CAM pill inspection sketch
│   ├── arduino_uno_gsm/
│   │   └── arduino_uno_gsm_box.ino        # Arduino UNO + SIM800L GSM sketch
│   └── wokwi_simulation/
│       ├── diagram.json                   # Wokwi simulation circuit configuration
│       └── sketch.ino                     # Wokwi simulation ESP32 code
├── ai_vision/
│   ├── pill_detector.py              # Standalone OpenCV pill verification script
│   └── requirements.txt
├── docs/
│   ├── CIRCUIT_DIAGRAM_AND_WIRING.md # Complete pinouts, wiring tables & schematics
│   ├── SYSTEM_ARCHITECTURE.md        # Mermaid flowcharts, sequence & ER diagrams
│   ├── PROJECT_REPORT.md             # Complete college project report & presentation
│   └── API_DOCUMENTATION.md          # REST API and WebSocket specifications
├── run_server.bat                    # One-click Windows start script
└── README.md
```

---

## 🚀 Quick Start Guide (How to Run)

### 1. Launching the Web App & Backend Server
Double-click `run_server.bat` OR run via terminal:
```bash
cd backend
npm install
npm start
```
Then open your browser at **https://smart-medicine-reminder-pi.vercel.app/**.

### 2. Testing the Workflow Instantly
1. Navigate to **Senior View** or **Smart Box Simulator**.
2. Click the **"Trigger Test Alarm"** button.
3. Hear the melodic chime alarm and voice announcement (*"Grandfather Robert, it is time for your Metformin 500mg..."*).
4. Watch the 10-minute escalation timer countdown.
5. In **Smart Box Simulator**, open the lid, click the **Green Button**, or remove the pill to see the camera verification turn into a **Green Tick Mark**.
6. Switch to **Caregiver Dashboard** to see the logged intake, live SMS feed, and updated adherence score!

---

## 🛠️ Hardware Wiring Quick Reference

| Component | Pin | ESP32 GPIO | Notes |
|---|---|---|---|
| **OLED (SSD1306)** | SDA / SCL | GPIO 21 / GPIO 22 | I2C Display (0x3C) |
| **RTC (DS3231)** | SDA / SCL | GPIO 21 / GPIO 22 | Shared I2C Bus |
| **Active Buzzer** | Positive (+) | GPIO 25 | Melodic tone alarms |
| **Green Button** | Terminal 1 | GPIO 14 (INPUT_PULLUP) | "Taken" confirmation |
| **Red Button** | Terminal 1 | GPIO 27 (INPUT_PULLUP) | "SOS / Help" |
| **Lid Sensor** | Terminal 1 | GPIO 13 (INPUT_PULLUP) | Reed switch / Limit switch |
| **Green LED** | Anode (+) | GPIO 18 (with 220Ω) | Tick / Confirmed |
| **Yellow LED** | Anode (+) | GPIO 19 (with 220Ω) | Reminder Active |
| **Red LED** | Anode (+) | GPIO 23 (with 220Ω) | Missed / Warning |

*(See [`docs/CIRCUIT_DIAGRAM_AND_WIRING.md`](docs/CIRCUIT_DIAGRAM_AND_WIRING.md) for full details).*

---

## 📄 Documentation Links
- 📘 [Project Report for College / Viva](docs/PROJECT_REPORT.md)
- 🔌 [Circuit Diagram & Wiring Guide](docs/CIRCUIT_DIAGRAM_AND_WIRING.md)
- 📐 [System Architecture & Flowcharts](docs/SYSTEM_ARCHITECTURE.md)
- 📡 [REST API & WebSocket Documentation](docs/API_DOCUMENTATION.md)
- 🌐 [Wokwi Online Simulator Setup](firmware/wokwi_simulation/)

---

## 💡 License & Attribution
Developed with ❤️ for Geriatric Healthcare and Senior Patient Safety. Open source under the MIT License.

Webpage:
<img width="1902" height="987" alt="image" src="https://github.com/user-attachments/assets/0cf5c44c-0583-4810-81c8-51894c75fac0" />

