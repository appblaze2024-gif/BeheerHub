'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Cpu, Wifi, Database, Info, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { firebaseConfig } from '@/firebase/config';

export default function IoTPage() {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const esp32Code = `
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

// Firebase instellingen
const String firebaseHost = "https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/";
const String apiKey = "${firebaseConfig.apiKey}";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("WiFi verbonden!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    
    // Voorbeeld: Update de vulgraad van prullenbak 'B001'
    String objectId = "B001";
    String url = firebaseHost + "objects/" + objectId + "?key=" + apiKey;
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    // Simuleer een sensorwaarde (vulgraad tussen 0 en 100)
    int vulgraad = random(0, 100);
    
    // JSON payload voor Firestore PATCH request
    String payload = "{\\"fields\\": {\\"vulgraad\\": {\\"integerValue\\": \\"" + String(vulgraad) + "\\"}}}";
    
    int httpResponseCode = http.sendRequest("PATCH", payload);
    
    if (httpResponseCode > 0) {
      Serial.print("HTTP Response code: ");
      Serial.println(httpResponseCode);
    } else {
      Serial.print("Fout bij verzenden: ");
      Serial.println(httpResponseCode);
    }
    
    http.end();
  }
  
  // Wacht 5 minuten voor de volgende meting
  delay(300000);
}
  `;

  const handleCopy = () => {
    navigator.clipboard.writeText(esp32Code.trim());
    setCopied(true);
    toast({
      title: "Gekopieerd",
      description: "ESP32 codevoorbeeld gekopieerd naar klembord.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-background">
      <PageHeader 
        title="IoT Dashboard & Integratie" 
        description="Beheer je slimme sensoren en koppel nieuwe hardware zoals de ESP32."
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
            <p className="text-xs text-muted-foreground">IoT Gateway is operationeel</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            ESP32 Integratie Gids
          </CardTitle>
          <CardDescription>
            Gebruik de onderstaande C++ code om je ESP32 te programmeren. Deze code is al geconfigureerd met de API-sleutels voor dit project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-start gap-3 border border-blue-100">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-bold mb-1">Hoe dit werkt:</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Installeer de Arduino IDE en voeg ESP32 ondersteuning toe.</li>
                <li>Zorg dat de <strong>HTTPClient</strong> en <strong>WiFi</strong> bibliotheken zijn geïnstalleerd.</li>
                <li>Vervang de WiFi gegevens in de code hieronder.</li>
                <li>De ESP32 zal via de Google Firestore REST API direct waarden (zoals de vulgraad) in de database aanpassen.</li>
              </ul>
            </div>
          </div>

          <div className="relative">
            <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs font-mono leading-relaxed max-h-[400px]">
              {esp32Code.trim()}
            </pre>
            <Button 
              variant="secondary" 
              size="sm" 
              className="absolute top-2 right-2"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-2">{copied ? 'Gekopieerd' : 'Kopieer code'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
