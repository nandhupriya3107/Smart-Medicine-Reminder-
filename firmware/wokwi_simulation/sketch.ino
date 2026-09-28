/*
  SMART REM - Wokwi Online Simulator ESP32 Sketch
  Ready to copy-paste into https://wokwi.com
*/

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

#define PIN_BUZZER    25
#define PIN_BTN_GREEN 14
#define PIN_BTN_RED   27
#define PIN_LED_GREEN 18
#define PIN_LED_YELLOW 19
#define PIN_LED_RED   23

int simSeconds = 0;
bool alarmActive = false;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);

  pinMode(PIN_BTN_GREEN, INPUT_PULLUP);
  pinMode(PIN_BTN_RED, INPUT_PULLUP);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
    for (;;);
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(15, 20);
  display.println("SMART REM BOX");
  display.setCursor(10, 35);
  display.println("Wokwi Sim Ready");
  display.display();
  delay(2000);
}

void loop() {
  simSeconds++;

  // Every 20 seconds, trigger a simulated medication reminder
  if (simSeconds % 20 == 0 && !alarmActive) {
    alarmActive = true;
    Serial.println("\n[ALARM] Time for Metformin 500mg (Compartment #1)!");
  }

  // Check Green Button (Taken)
  if (digitalRead(PIN_BTN_GREEN) == LOW) {
    Serial.println("[BUTTON] GREEN PRESSED: Medicine Taken Confirmed!");
    alarmActive = false;
    digitalWrite(PIN_LED_GREEN, HIGH);
    digitalWrite(PIN_LED_YELLOW, LOW);
    digitalWrite(PIN_LED_RED, LOW);
    noTone(PIN_BUZZER);

    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(10, 15);
    display.println("CONFIRMED!");
    display.setTextSize(1);
    display.setCursor(10, 45);
    display.println("Pill Taken [OK]");
    display.display();
    delay(2000);
    digitalWrite(PIN_LED_GREEN, LOW);
  }

  // Check Red Button (SOS)
  if (digitalRead(PIN_BTN_RED) == LOW) {
    Serial.println("[BUTTON] RED PRESSED: Emergency SOS! Calling Family SMS...");
    alarmActive = false;
    digitalWrite(PIN_LED_RED, HIGH);
    digitalWrite(PIN_LED_YELLOW, LOW);

    display.clearDisplay();
    display.setTextSize(2);
    display.setCursor(15, 15);
    display.println("SOS ALERT!");
    display.setTextSize(1);
    display.setCursor(10, 45);
    display.println("Family Alerted");
    display.display();

    tone(PIN_BUZZER, 800, 500);
    delay(2000);
    digitalWrite(PIN_LED_RED, LOW);
  }

  if (alarmActive) {
    digitalWrite(PIN_LED_YELLOW, HIGH);
    tone(PIN_BUZZER, 650, 150);

    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println(">> MEDICINE TIME <<");
    display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
    display.setCursor(0, 18);
    display.println("Metformin 500mg");
    display.setCursor(0, 32);
    display.println("Box Compartment #1");
    display.drawLine(0, 48, 128, 48, SSD1306_WHITE);
    display.setCursor(0, 52);
    display.println("[GRN] Taken  [RED] SOS");
    display.display();
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("SMART REM - STANDBY");
    display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
    display.setCursor(10, 25);
    display.println("Status: ALL SAFE");
    display.setCursor(10, 40);
    display.println("Next Pill in 15s");
    display.display();
  }

  delay(400);
}
