# SMART REM - Circuit Diagram & Hardware Wiring Guide

This document provides complete connection tables, pin assignments, power supply architecture, and circuit schematics for building the physical **Smart Medicine Box**.

---

## 1. Bill of Materials (Component List)

| S.No | Component Name | Specification | Purpose |
|---|---|---|---|
| 1 | **ESP32 NodeMCU Development Board** | 30-Pin / 38-Pin ESP-WROOM-32 | Master IoT Controller (Wi-Fi, RTC sync, I/O) |
| 2 | **ESP32-CAM Board** | AI-Thinker OV2640 2MP | Internal box camera for pill intake verification |
| 3 | **0.96" I2C OLED Display** | SSD1306 (128x64 pixels, Blue/Yellow) | Shows medicine name, dose, compartment # |
| 4 | **DS3231 RTC Module** | High precision I2C Real Time Clock with CR2032 battery | Accurate offline time tracking |
| 5 | **Active Buzzer** | 5V Piezoelectric Buzzer | Melodic audio reminder alarm for elderly |
| 6 | **Push Buttons (x2)** | 12mm Tactile Buttons with Green/Red caps | Green = Taken, Red = SOS / Help |
| 7 | **Status LEDs (x3)** | 5mm LEDs (Green, Yellow, Red) | Visual status indicators |
| 8 | **Current Limiting Resistors (x3)** | 220Ω / 330Ω 1/4W | Protects LEDs |
| 9 | **Magnetic Reed Switch** | Normally Open (NO) or Limit Switch | Detects opening & closing of medicine box lid |
| 10 | **SIM800L GSM Module (Optional)** | 2G/GPRS Quad-band with antenna | Standalone direct cellular SMS fallback |
| 11 | **Power Supply** | 5V 2A DC Adapter or 3.7V 18650 Li-ion with TP4056 + Boost | System power source |
| 12 | **Pill Compartment Chassis** | 4-Slot 3D Printed / Acrylic Box | Physical housing with partitioned tray |

---

## 2. Master ESP32 Pinout & Connection Table

| Component | Component Pin | ESP32 GPIO Pin | Wire Color | Function / Notes |
|---|---|---|---|---|
| **OLED SSD1306** | VCC | 3.3V / VIN | Red | Power |
| | GND | GND | Black | Ground |
| | SCL | **GPIO 22** | Yellow | I2C Clock |
| | SDA | **GPIO 21** | Blue | I2C Data |
| **DS3231 RTC** | VCC | 3.3V | Red | Power |
| | GND | GND | Black | Ground |
| | SCL | **GPIO 22** | Yellow | Shared I2C Bus |
| | SDA | **GPIO 21** | Blue | Shared I2C Bus |
| **Active Buzzer** | Positive (+) | **GPIO 25** | Green | PWM / Tone output |
| | Negative (-) | GND | Black | Ground |
| **Green Button** | Pin 1 | **GPIO 14** | Green | Internal Pull-up (LOW when pressed) |
| | Pin 2 | GND | Black | Ground |
| **Red Button** | Pin 1 | **GPIO 27** | Red | Internal Pull-up (LOW when pressed) |
| | Pin 2 | GND | Black | Ground |
| **Lid Reed Switch** | Terminal 1 | **GPIO 13** | White | Internal Pull-up (LOW when lid opened) |
| | Terminal 2 | GND | Black | Ground |
| **Green LED** | Anode (+) | Resistor -> **GPIO 18** | Green | Confirmed / Tick Indication |
| | Cathode (-) | GND | Black | Ground |
| **Yellow LED** | Anode (+) | Resistor -> **GPIO 19** | Yellow | Pending Reminder Active |
| | Cathode (-) | GND | Black | Ground |
| **Red LED** | Anode (+) | Resistor -> **GPIO 23** | Red | Missed Dose / Warning Indication |
| | Cathode (-) | GND | Black | Ground |

---

## 3. ESP32-CAM Wiring Diagram

The ESP32-CAM is mounted on the inner top lid of the box, facing down toward the 4 pill compartments.

```
+-------------------------------------------------------------+
|                     ESP32-CAM (AI-THINKER)                  |
|                                                             |
|  [5V]  <-------------------- +5V Power Supply Bus           |
|  [GND] <-------------------- Common Ground (GND)            |
|  [GPIO 13] <---------------- Trigger Wire from Master ESP32 |
|                               (Signals when lid is opened)  |
|                                                             |
|  [OV2640 Lens] -----------> Pointing down to 4 compartments |
|  [GPIO 4 Flash LED] ------> Illuminates compartment tray    |
+-------------------------------------------------------------+
```

---

## 4. Full Master Circuit Schematic (ASCII)

```
                       +-------------------+
                       |    5V / 2A VCC    |
                       +---------+---------+
                                 |
       +-------------------------+-------------------------+
       |                         |                         |
+------v------+           +------v------+           +------v------+
|  ESP32 MCU  |           | OLED SSD1306|           | DS3231 RTC  |
|             |           |             |           |             |
| 3V3 / VIN   |<----------| VCC         |           | VCC         |
| GND         |<----------| GND         |           | GND         |
| GPIO 22     |---------->| SCL <-------+---------->| SCL         |
| GPIO 21     |<--------->| SDA <-------+---------->| SDA         |
|             |           +-------------+           +-------------+
| GPIO 25     |----------> [ (+) BUZZER (-) ] ------> GND
|             |
| GPIO 14     |----------> [ GREEN BUTTON ] ---------> GND (Taken Confirmation)
| GPIO 27     |----------> [ RED BUTTON ] -----------> GND (Emergency SOS)
| GPIO 13     |----------> [ REED SWITCH ] ----------> GND (Lid Open Sensor)
|             |
| GPIO 18     |--> [220R] --> [ GREEN LED (Taken Tick) ] --> GND
| GPIO 19     |--> [220R] --> [ YELLOW LED (Pending) ]   --> GND
| GPIO 23     |--> [220R] --> [ RED LED (Missed/Alert) ] --> GND
+------+------+
       |
       +--(Wi-Fi 2.4GHz / HTTP REST)----> [ Backend Cloud / Local Server ]
```

---

## 5. Power Supply & Battery Management

For portable bedside use:
1. **Battery**: 3.7V 2500mAh 18650 Lithium-Ion rechargeable battery.
2. **Charging Module**: TP4056 USB-C Li-ion charger with battery over-discharge protection.
3. **Step-Up Converter**: MT3608 DC-DC boost module stepping up 3.7V to stable 5.0V.
4. **Current Consumption**:
   - Deep Sleep: ~15 µA
   - Active Standby: ~45 mA
   - Reminder Alarm (OLED + Buzzer + Wi-Fi): ~160 mA
   - Camera Capture with Flash LED: ~280 mA (for 1.5 seconds)
