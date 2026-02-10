'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Cpu, Wifi, Database, Copy, Check, Code2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { firebaseConfig } from '@/firebase/config';

const IOT_TEMPLATES = [
  {
    id: 'ultrasoon-vulgraad',
    label: 'Prullenbak Vulgraad (HC-SR04)',
    description: 'Gebruikt een ultrasoon sensor om de afstand tot het afval te meten en de vulgraad (%) bij te werken in Firestore.',
    code: (projectId: string, apiKey: string) => `#include <WiFi.h>
#include <HTTPClient.h>

// --- CONFIGURATIE ---
const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

// Firebase/Firestore instellingen
const String projectId = "${projectId}";
const String apiKey = "${apiKey}";
const String objectId = "B001"; // ID van de prullenbak in het systeem

// Sensor pinnen
const int trigPin = 5;
const int echoPin = 18;
const int binHeight = 100; // Hoogte van de prullenbak in cm

void setup() {
  Serial.begin(115200);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\\nWiFi verbonden!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // Afstand meten
    digitalWrite(trigPin, LOW); delayMicroseconds(2);
    digitalWrite(trigPin, HIGH); delayMicroseconds(10);
    digitalWrite(trigPin, LOW);
    long duration = pulseIn(echoPin, HIGH);
    int distance = duration * 0.034 / 2;
    
    // Bereken vulgraad percentage (omgekeerd: minder afstand = voller)
    int percentage = map(distance, 0, binHeight, 100, 0);
    percentage = constrain(percentage, 0, 100);

    // Firestore Update
    HTTPClient http;
    String url = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/objects/" + objectId + "?key=" + apiKey;
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\\"fields\\": {\\"vulgraad\\": {\\"integerValue\\": \\"" + String(percentage) + "\\"}}}";
    int httpResponseCode = http.sendRequest("PATCH", payload);
    
    if (httpResponseCode > 0) {
      Serial.printf("Vulgraad %d%% succesvol verzonden naar %s\\n", percentage, objectId.c_興);
    }
    http.end();
  }
  delay(300000); // 5 minuten wachten
}`
  },
  {
    id: 'dht-temperatuur',
    label: 'Temperatuur & Luchtvochtigheid (DHT11/22)',
    description: 'Slaat sensorgegevens op in een specifieke collectie voor monitoring van locaties.',
    code: (projectId: string, apiKey: string) => `#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"

const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

const String projectId = "${projectId}";
const String apiKey = "${apiKey}";

#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void loop() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (WiFi.status() == WL_CONNECTED && !isnan(h) && !isnan(t)) {
    HTTPClient http;
    // We slaan dit op onder een 'sensor_data' document
    String url = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/settings/iot_data?key=" + apiKey;
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\\"fields\\": {\\"temperatuur\\": {\\"doubleValue\\": " + String(t) + "}, \\"luchtvochtigheid\\": {\\"doubleValue\\": " + String(h) + "}}}";
    http.sendRequest("PATCH", payload);
    http.end();
  }
  delay(60000);
}`
  },
  {
    id: 'basis-status',
    label: 'Basis Status (Heartbeat)',
    description: 'Eenvoudige code die aangeeft dat een apparaat online is door een timestamp bij te werken.',
    code: (projectId: string, apiKey: string) => `#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = "https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/iot_status?key=${apiKey}";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    String payload = "{\\"fields\\": {\\"last_seen\\": {\\"stringValue\\": \\"online\\"}, \\"device_id\\": {\\"stringValue\\": \\"ESP32_MAIN\\"}}}";
    http.sendRequest("PATCH", payload);
    http.end();
  }
  delay(60000);
}`
  }
];

export default function IoTPage() {
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(IOT_TEMPLATES[0].id);
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  const currentTemplate = IOT_TEMPLATES.find(t => t.id === selectedTemplateId) || IOT_TEMPLATES[0];
  const generatedCode = currentTemplate.code(firebaseConfig.projectId, firebaseConfig.apiKey);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    toast({
      title: "Code gekopieerd!",
      description: "Plak de code direct in de Arduino IDE.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-background overflow-y-auto">
      <PageHeader 
        title="IoT Dashboard & Hardware Integratie" 
        description="Beheer je sensoren en gebruik kant-en-klare code om je hardware te koppelen aan dit project."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4 text-blue-600" />
              Verbonden Apparaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Geen actieve sensoren gedetecteerd</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/10 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-green-600" />
              Data Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Laatste 24 uur</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-900/10 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4 text-purple-600" />
              Systeem Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">Online</p>
            <p className="text-xs text-muted-foreground">Data Gateway is operationeel</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-8">
        <div className="xl:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-primary" />
                Code Generator
              </CardTitle>
              <CardDescription>
                Selecteer een scenario om direct werkende ESP32 code te genereren.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Kies Scenario</label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IOT_TEMPLATES.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-muted rounded-md text-xs">
                <p className="font-semibold mb-1">Beschrijving:</p>
                <p className="text-muted-foreground">{currentTemplate.description}</p>
              </div>
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-xs font-bold text-amber-800 dark:text-amber-400">Gratis Gebruik</AlertTitle>
                <AlertDescription className="text-[10px] text-amber-700 dark:text-amber-500">
                  Deze code is gebaseerd op templates en gebruikt geen AI-services. Er zijn dus GEEN extra API-kosten.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Arduino / C++ Code</CardTitle>
                <CardDescription>Volledig geconfigureerd voor jouw project.</CardDescription>
              </div>
              <Button size="sm" onClick={handleCopy} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Gekopieerd' : 'Kopieer code'}
              </Button>
            </CardHeader>
            <CardContent className="flex-1 min-h-[400px]">
              <div className="relative h-full rounded-md bg-zinc-950 p-4 font-mono text-sm overflow-auto text-zinc-300">
                <pre><code>{generatedCode}</code></pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
