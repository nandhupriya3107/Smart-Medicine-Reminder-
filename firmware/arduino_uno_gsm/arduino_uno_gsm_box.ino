/*
 ==============================================================================
  SMART REM - Arduino UNO + SIM800L GSM Medicine Reminder Box
  (Standalone Offline Version with Direct GSM SMS Alert)
  
  Components:
  - Arduino UNO
  - SIM800L GSM Modem (Pins 10, 11 via SoftwareSerial)
  - DS3231 RTC Module (I2C: SDA A4, SCL A5)
  - 16x2 I2C LCD Display (I2C: 0x27)
  - Active Buzzer (Pin 8)
  - Green Button - Taken (Pin 2 - INT0)
  - Red Button - SOS / Declined (Pin 3 - INT1)
  - Green LED - Taken Verified (Pin 4)
  - Red LED - Missed / Alert (Pin 5)
 ==============================================================================
*/

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <RTClib.h>
#include <SoftwareSerial.h>

// --- GSM MODEM CONFIGURATION ---
SoftwareSerial gsmSerial(10, 11); // RX, TX
const char* EMERGENCY_PHONE_1 = "+15553456789"; // Family Member Phone Number
const char* PATIENT_NAME = "Grandfather Robert";

// --- LCD & RTC ---
LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS3231 rtc;

// --- PIN DEFINITIONS ---
const int PIN_BTN_GREEN = 2; // Interrupt 0
const int PIN_BTN_RED   = 3; // Interrupt 1
const int PIN_LED_GREEN = 4;
const int PIN_LED_RED   = 5;
const int PIN_BUZZER    = 8;

// --- PRESCRIBED MEDICATION SCHEDULE (HH, MM, Name) ---
struct Medication {
  int hour;
  int minute;
  const char* name;
  const char* dose;
  int compartment;
  bool triggeredToday;
};

Medication schedules[] = {
  {8, 0, "Metformin", "500mg 1 Tab", 1, false},
  {13, 0, "Amlodipine", "5mg 1 Tab", 2, false},
  {20, 0, "Atorvastatin", "20mg 1 Tab", 3, false}
};
const int TOTAL_MEDS = 3;

// State
bool alarmActive = false;
int activeMedIndex = -1;
unsigned long alarmStartTime = 0;
const unsigned long GRACE_PERIOD_MS = 600000; // 10 minutes in milliseconds

void setup() {
  Serial.begin(9600);
  gsmSerial.begin(9600);
  delay(1000);

  pinMode(PIN_BTN_GREEN, INPUT_PULLUP);
  pinMode(PIN_BTN_RED, INPUT_PULLUP);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("SMART REM BOX");
  lcd.setCursor(0, 1);
  lcd.print("Init Hardware...");

  // Initialize RTC
  if (!rtc.begin()) {
    lcd.setCursor(0, 1);
    lcd.print("RTC Error!");
  }

  // Initialize GSM
  initGSM();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SMART REM READY");
  delay(2000);
}

void loop() {
  DateTime now = rtc.now();

  // Reset daily flags at midnight
  if (now.hour() == 0 && now.minute() == 0 && now.second() < 2) {
    for (int i = 0; i < TOTAL_MEDS; i++) {
      schedules[i].triggeredToday = false;
    }
  }

  // 1. Check if it's time for any medicine
  if (!alarmActive) {
    for (int i = 0; i < TOTAL_MEDS; i++) {
      if (now.hour() == schedules[i].hour && now.minute() == schedules[i].minute && !schedules[i].triggeredToday) {
        startMedicationAlarm(i);
        break;
      }
    }
    showStandbyScreen(now);
  }

  // 2. Handle active alarm
  if (alarmActive) {
    // Check buttons
    if (digitalRead(PIN_BTN_GREEN) == LOW) {
      onTakenConfirmed();
    } else if (digitalRead(PIN_BTN_RED) == LOW) {
      onEmergencySOS();
    }

    // Sound reminder buzzer
    tone(PIN_BUZZER, 1000, 200);
    delay(250);

    // Check if grace period expired without response
    if (millis() - alarmStartTime > GRACE_PERIOD_MS) {
      onGracePeriodExpired();
    }
  }

  delay(100);
}

void showStandbyScreen(DateTime now) {
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate > 1000) {
    lastUpdate = millis();
    lcd.setCursor(0, 0);
    lcd.print("TIME: ");
    if (now.hour() < 10) lcd.print('0');
    lcd.print(now.hour());
    lcd.print(':');
    if (now.minute() < 10) lcd.print('0');
    lcd.print(now.minute());
    lcd.print(':');
    if (now.second() < 10) lcd.print('0');
    lcd.print(now.second());

    lcd.setCursor(0, 1);
    lcd.print("ALL MEDS SAFE OK");
  }
}

void startMedicationAlarm(int index) {
  alarmActive = true;
  activeMedIndex = index;
  schedules[index].triggeredToday = true;
  alarmStartTime = millis();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("TAKE: ");
  lcd.print(schedules[index].name);
  lcd.setCursor(0, 1);
  lcd.print("BOX #");
  lcd.print(schedules[index].compartment);
  lcd.print(" ");
  lcd.print(schedules[index].dose);
}

void onTakenConfirmed() {
  alarmActive = false;
  noTone(PIN_BUZZER);
  digitalWrite(PIN_LED_GREEN, HIGH);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CONFIRMED [OK]");
  lcd.setCursor(0, 1);
  lcd.print("Medicine Taken!");

  delay(3000);
  digitalWrite(PIN_LED_GREEN, LOW);
}

void onEmergencySOS() {
  alarmActive = false;
  noTone(PIN_BUZZER);
  digitalWrite(PIN_LED_RED, HIGH);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("EMERGENCY SOS!");
  lcd.setCursor(0, 1);
  lcd.print("Sending SMS...");

  sendSMS(EMERGENCY_PHONE_1, "URGENT: Emergency Help SOS Button pressed on Smart Medicine Box by Grandfather Robert!");

  delay(3000);
  digitalWrite(PIN_LED_RED, LOW);
}

void onGracePeriodExpired() {
  alarmActive = false;
  noTone(PIN_BUZZER);
  digitalWrite(PIN_LED_RED, HIGH);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("MISSED MED ALARM");
  lcd.setCursor(0, 1);
  lcd.print("Alerting Family");

  String msg = String("URGENT: ") + PATIENT_NAME + " did NOT take scheduled medicine: " +
               schedules[activeMedIndex].name + " (" + schedules[activeMedIndex].dose + "). Please check immediately!";
  
  sendSMS(EMERGENCY_PHONE_1, msg.c_str());

  delay(4000);
  digitalWrite(PIN_LED_RED, LOW);
}

// ----------------------------------------------------------------------------
// GSM AT COMMAND UTILITIES
// ----------------------------------------------------------------------------
void initGSM() {
  gsmSerial.println("AT");
  delay(1000);
  gsmSerial.println("AT+CMGF=1"); // Set SMS text mode
  delay(1000);
}

void sendSMS(const char* phoneNumber, const char* textMessage) {
  gsmSerial.print("AT+CMGS=\"");
  gsmSerial.print(phoneNumber);
  gsmSerial.println("\"");
  delay(1000);

  gsmSerial.print(textMessage);
  delay(500);

  gsmSerial.write(26); // Ctrl+Z to send
  delay(3000);
}
