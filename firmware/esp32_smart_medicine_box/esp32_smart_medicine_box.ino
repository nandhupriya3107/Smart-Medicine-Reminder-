/*
 ==============================================================================
  SMART REM - Medicine Reminder System for Elderly People
  ESP32 Smart Medicine Box Controller Firmware
  
  Features:
  - Wi-Fi Connectivity & REST API Synchronization
  - Real-Time Clock (DS3231 I2C) Time Management
  - 0.96" I2C OLED Display (SSD1306) for Medicine Names & Instructions
  - Audio Buzzer with Progressive Melodies for Elderly Hearing
  - Physical Push Buttons:
      * GREEN BUTTON (GPIO 14) : Medicine Taken Confirmation
      * RED BUTTON   (GPIO 27) : Emergency SOS & Decline
  - Magnetic Reed Switch (GPIO 13) : Box Lid Open / Close Detection
  - Status LEDs:
      * GREEN LED  (GPIO 18) : Intake Verified (Tick Indication)
      * YELLOW LED (GPIO 19) : Reminder Active / Pending
      * RED LED    (GPIO 23) : Missed Dose / Warning Indication
  - GSM SIM800L Direct SMS Fallback Support (Optional UART)
 ==============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <RTClib.h>
#include <ArduinoJson.h>

// --- NETWORK CONFIGURATION ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "http://192.168.1.100:3000"; // Replace with your backend server IP

// --- PIN DEFINITIONS ---
#define PIN_BUZZER        25
#define PIN_BTN_GREEN     14    // Taken Confirmation
#define PIN_BTN_RED       27    // SOS / Declined
#define PIN_LID_REED      13    // Magnetic Reed Switch
#define PIN_LED_GREEN     18
#define PIN_LED_YELLOW    19
#define PIN_LED_RED       23

// --- OLED DISPLAY CONFIG ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- REAL TIME CLOCK ---
RTC_DS3231 rtc;

// --- STATE VARIABLES ---
bool isAlarmActive = false;
String currentMedName = "";
String currentMedDose = "";
int currentCompartment = 1;
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 5000; // 5 seconds

// Melody tone notes
const int NOTE_C5 = 523;
const int NOTE_E5 = 659;
const int NOTE_G5 = 784;
const int NOTE_C6 = 1047;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[INIT] SMART REM ESP32 Firmware Starting...");

  // 1. Initialize GPIO Pins
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);

  pinMode(PIN_BTN_GREEN, INPUT_PULLUP);
  pinMode(PIN_BTN_RED, INPUT_PULLUP);
  pinMode(PIN_LID_REED, INPUT_PULLUP);

  // Initial LED Test
  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_YELLOW, HIGH);
  digitalWrite(PIN_LED_RED, HIGH);
  delay(500);
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_YELLOW, LOW);
  digitalWrite(PIN_LED_RED, LOW);

  // 2. Initialize OLED Display
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERROR] SSD1306 OLED allocation failed");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 10);
    display.println("SMART REM BOX");
    display.setCursor(10, 30);
    display.println("Connecting WiFi...");
    display.display();
  }

  // 3. Initialize DS3231 RTC
  if (!rtc.begin()) {
    Serial.println("[WARN] DS3231 RTC not found, using internal timer");
  } else if (rtc.lostPower()) {
    Serial.println("[RTC] RTC lost power, setting compile time");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  // 4. Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WIFI] Connecting to ");
  Serial.print(WIFI_SSID);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected successfully!");
    Serial.print("[WIFI] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WIFI] Offline mode active (RTC and Buttons operational)");
  }

  showStandbyDisplay();
}

void loop() {
  // 1. Check Button Inputs
  checkPhysicalButtons();

  // 2. Periodic Backend Heartbeat & Alarm Sync
  if (millis() - lastHeartbeatTime > HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = millis();
    syncWithBackend();
  }

  // 3. Handle Active Alarm Sounds & Flashes
  if (isAlarmActive) {
    playReminderMelody();
  }

  delay(50);
}

// ----------------------------------------------------------------------------
// PHYSICAL BUTTON & SENSOR HANDLERS
// ----------------------------------------------------------------------------
void checkPhysicalButtons() {
  // Green Button (Taken)
  if (digitalRead(PIN_BTN_GREEN) == LOW) {
    delay(50); // Debounce
    if (digitalRead(PIN_BTN_GREEN) == LOW) {
      Serial.println("[BUTTON] GREEN BUTTON PRESSED - Medicine Taken");
      onGreenButtonPressed();
      while (digitalRead(PIN_BTN_GREEN) == LOW); // Wait release
    }
  }

  // Red Button (Emergency SOS / Declined)
  if (digitalRead(PIN_BTN_RED) == LOW) {
    delay(50); // Debounce
    if (digitalRead(PIN_BTN_RED) == LOW) {
      Serial.println("[BUTTON] RED BUTTON PRESSED - Emergency SOS!");
      onRedButtonPressed();
      while (digitalRead(PIN_BTN_RED) == LOW); // Wait release
    }
  }

  // Box Lid Reed Switch
  static int lastLidState = HIGH;
  int currentLidState = digitalRead(PIN_LID_REED);
  if (currentLidState != lastLidState) {
    lastLidState = currentLidState;
    if (currentLidState == LOW) {
      Serial.println("[LID] Box Lid OPENED");
      sendLidEvent("LID_OPENED");
    } else {
      Serial.println("[LID] Box Lid CLOSED");
      sendLidEvent("LID_CLOSED");
    }
  }
}

void onGreenButtonPressed() {
  // Turn on Green LED indicator
  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_YELLOW, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  isAlarmActive = false;
  noTone(PIN_BUZZER);

  // Show Confirmation on OLED
  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(15, 10);
  display.println("CONFIRMED!");
  display.setTextSize(1);
  display.setCursor(10, 40);
  display.println("Medicine Taken [OK]");
  display.display();

  // Play short success chirp
  tone(PIN_BUZZER, NOTE_C6, 200);
  delay(250);
  tone(PIN_BUZZER, NOTE_G5, 300);

  // Send API event
  sendActionToBackend("GREEN_BUTTON_PRESSED");
  delay(2500);
  digitalWrite(PIN_LED_GREEN, LOW);
  showStandbyDisplay();
}

void onRedButtonPressed() {
  // Red Alert
  digitalWrite(PIN_LED_RED, HIGH);
  digitalWrite(PIN_LED_YELLOW, LOW);
  isAlarmActive = false;

  // Show SOS Alert on OLED
  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(20, 10);
  display.println("SOS ALERT!");
  display.setTextSize(1);
  display.setCursor(5, 40);
  display.println("Calling Family Members");
  display.display();

  // Play warning alarm
  for (int i = 0; i < 3; i++) {
    tone(PIN_BUZZER, 800, 200);
    delay(250);
    tone(PIN_BUZZER, 400, 200);
    delay(250);
  }

  sendActionToBackend("RED_BUTTON_PRESSED");
  delay(3000);
  digitalWrite(PIN_LED_RED, LOW);
  showStandbyDisplay();
}

// ----------------------------------------------------------------------------
// DISPLAY CONTROLLERS
// ----------------------------------------------------------------------------
void showStandbyDisplay() {
  DateTime now = rtc.now();
  display.clearDisplay();
  
  // Header: Time & Status
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.printf("%02d:%02d:%02d", now.hour(), now.minute(), now.second());
  display.setCursor(80, 0);
  display.println(WiFi.status() == WL_CONNECTED ? "WIFI:OK" : "STANDALONE");
  
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

  // Body: Standby Message
  display.setTextSize(1);
  display.setCursor(15, 20);
  display.println("SMART REM BOX");
  display.setCursor(10, 34);
  display.println("System Ready & Safe");

  // Footer: Button Guide
  display.drawLine(0, 50, 128, 50, SSD1306_WHITE);
  display.setCursor(5, 54);
  display.println("[GRN] Taken  [RED] SOS");

  display.display();
}

void showAlarmDisplay(String medName, String medDose, int compartment) {
  display.clearDisplay();

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(">> MEDICINE TIME <<");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 16);
  display.print("BOX COMPARTMENT: #");
  display.println(compartment);

  display.setTextSize(1);
  display.setCursor(0, 30);
  display.println(medName);
  
  display.setCursor(0, 42);
  display.println(medDose);

  display.drawLine(0, 52, 128, 52, SSD1306_WHITE);
  display.setCursor(0, 55);
  display.println("PRESS GREEN WHEN TAKEN");

  display.display();
}

// ----------------------------------------------------------------------------
// AUDIO ALARM FOR ELDERLY
// ----------------------------------------------------------------------------
void playReminderMelody() {
  digitalWrite(PIN_LED_YELLOW, HIGH);
  tone(PIN_BUZZER, NOTE_C5, 200); delay(220);
  tone(PIN_BUZZER, NOTE_E5, 200); delay(220);
  tone(PIN_BUZZER, NOTE_G5, 200); delay(220);
  tone(PIN_BUZZER, NOTE_C6, 400); delay(450);
  digitalWrite(PIN_LED_YELLOW, LOW);
  delay(1500); // Pause between melody cycles
}

// ----------------------------------------------------------------------------
// BACKEND REST API COMMUNICATION
// ----------------------------------------------------------------------------
void syncWithBackend() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/box/heartbeat";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST("{}");
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      if (!doc["activeAlarm"].isNull()) {
        JsonObject alarm = doc["activeAlarm"];
        JsonObject med = alarm["medicine"];
        
        currentMedName = med["name"].as<String>();
        currentMedDose = med["dosage"].as<String>();
        currentCompartment = med["compartmentNumber"].as<int>();
        
        if (!isAlarmActive) {
          isAlarmActive = true;
          showAlarmDisplay(currentMedName, currentMedDose, currentCompartment);
        }
      } else {
        if (isAlarmActive) {
          isAlarmActive = false;
          noTone(PIN_BUZZER);
          showStandbyDisplay();
        }
      }
    }
  }
  http.end();
}

void sendActionToBackend(String action) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/box/action";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\"action\":\"" + action + "\", \"compartmentNumber\":" + String(currentCompartment) + "}";
  http.POST(jsonPayload);
  http.end();
}

void sendLidEvent(String action) {
  sendActionToBackend(action);
}
