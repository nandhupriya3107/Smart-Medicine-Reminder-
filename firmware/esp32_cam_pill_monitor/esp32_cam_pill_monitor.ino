/*
 ==============================================================================
  SMART REM - ESP32-CAM Internal Pill Verification Firmware
  
  Board: AI-Thinker ESP32-CAM
  Camera: OV2640 2 Megapixels
  
  Function:
  - Positioned inside the lid of the Smart Medicine Box.
  - Activates when the box lid is opened.
  - Illuminates compartment tray using Onboard Flash LED (GPIO 4).
  - Captures high-clarity snapshot of the tablet compartment.
  - Sends image via HTTP POST to the backend computer vision verification engine.
  - Confirms whether the tablet has been removed (Green tick mark) or left behind (Warning/Red mark).
 ==============================================================================
*/

#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

// --- NETWORK CREDENTIALS ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_SERVER = "http://192.168.1.100:3000/api/box/verify-pill";

// --- AI-THINKER CAMERA PIN CONFIGURATION ---
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// Flash LED Pin
#define FLASH_LED_PIN      4

// Trigger Pin connected from Master ESP32 or Reed Switch
#define TRIGGER_PIN       13

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[INIT] SMART REM ESP32-CAM Pill Monitor Starting...");

  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW); // Off initially

  pinMode(TRIGGER_PIN, INPUT_PULLUP);

  // 1. Configure Camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA; // 640x480 for fast CV transmission
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  // Init Camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[ERROR] Camera init failed with error 0x%x\n", err);
    return;
  }
  Serial.println("[CAM] OV2640 Camera initialized successfully.");

  // 2. Connect to Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WIFI] Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WIFI] Connected! CAM IP: " + WiFi.localIP().toString());
}

void loop() {
  // Check if box lid opened or capture triggered
  if (digitalRead(TRIGGER_PIN) == LOW) {
    Serial.println("[TRIGGER] Box lid opened or verification requested!");
    captureAndSendPillVerification(1);
    delay(5000); // Debounce to prevent multiple immediate captures
  }
  delay(100);
}

void captureAndSendPillVerification(int compartmentNumber) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi not connected. Cannot upload snapshot.");
    return;
  }

  // Turn on Flash LED for clear illumination
  digitalWrite(FLASH_LED_PIN, HIGH);
  delay(100); // Allow camera sensor exposure to adjust

  // Snap image
  camera_fb_t *fb = esp_camera_fb_get();
  digitalWrite(FLASH_LED_PIN, LOW); // Turn off Flash LED

  if (!fb) {
    Serial.println("[ERROR] Camera frame buffer capture failed!");
    return;
  }

  Serial.printf("[CAM] Captured image: %u bytes\n", fb->len);

  // Encode to Base64
  String base64Img = base64::encode((uint8_t*)fb->buf, fb->len);
  String dataUri = "data:image/jpeg;base64," + base64Img;

  // Release camera buffer
  esp_camera_fb_return(fb);

  // Send to backend via HTTP POST
  HTTPClient http;
  http.begin(BACKEND_SERVER);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"imageData\":\"" + dataUri + "\",\"compartmentNumber\":" + String(compartmentNumber) + "}";

  int httpCode = http.POST(payload);
  if (httpCode == HTTP_CODE_OK) {
    String response = http.getString();
    Serial.println("[SUCCESS] Verification Response: " + response);
  } else {
    Serial.printf("[ERROR] HTTP POST failed, code: %d\n", httpCode);
  }

  http.end();
}
