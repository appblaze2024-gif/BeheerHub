'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Cpu, Wifi, Database, Info, Copy, Check, Loader2, Sparkles, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { firebaseConfig } from '@/firebase/config';
import { Textarea } from '@/components/ui/textarea';
import { generateIoTCode } from '@/ai/flows/generate-iot-code-flow';

const DEFAULT_CODE = `
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

export default function IoTPage() {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const [userPrompt, setUserPrompt] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedCode, setGeneratedCode] = React.useState(DEFAULT_CODE.trim());
  const [explanation, setExplanation] = React.useState('Dit is een standaard voorbeeld om een prullenbak-sensor te simuleren.');

  const handleGenerateCode = async () => {
    if (!userPrompt.trim()) {
      toast({
        variant: "destructive",
        title: "Lege vraag",
        description: "Stel eerst een vraag over de gewenste functionaliteit.",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateIoTCode({
        prompt: userPrompt,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey,
      });
      
      setGeneratedCode(result.code.trim());
      setExplanation(result.explanation);
      toast({
        title: "Code gegenereerd",
        description: "De ESP32 code is bijgewerkt op basis van je vraag.",
      });
    } catch (error) {
      console.error("Fout bij genereren code:", error);
      toast({
        variant: "destructive",
        title: "Fout",
        description: "Er is een fout opgetreden bij het genereren van de code.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    toast({
      title: "Gekopieerd",
      description: "ESP32 code gekopieerd naar klembord.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-background">
      <PageHeader 
        title="IoT Dashboard & AI Integratie" 
        description="Beheer je sensoren en gebruik AI om direct werkende code voor je ESP32 te schrijven."
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
            <p className="text-xs text-muted-foreground">AI Gateway is operationeel</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6 min-h-0">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Vraag het aan de IoT-Assistent
            </CardTitle>
            <CardDescription>
              Stel een vraag over wat je ESP32 moet doen. De AI schrijft de code voor je, inclusief de juiste Firebase-koppelingen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <Textarea 
              placeholder="Bijv: Maak een programma dat elke 10 minuten de batterijspanning van een sensor stuurt naar object ID 'BAT-01'..."
              className="flex-1 min-h-[150px] resize-none"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
            />
            <Button 
              onClick={handleGenerateCode} 
              disabled={isGenerating || !userPrompt.trim()}
              className="w-full h-12"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Code genereren...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-5 w-5" />
                  Genereer ESP32 Code
                </>
              )}
            </Button>

            {explanation && (
              <div className="bg-muted p-4 rounded-lg border">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
                  <Info className="h-3 w-3" />
                  Uitleg
                </p>
                <p className="text-sm leading-relaxed">
                  {explanation}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                Gegenereerde C++ Code
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCopy}
                className="h-8"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-2">{copied ? 'Gekopieerd' : 'Kopieer'}</span>
              </Button>
            </CardTitle>
            <CardDescription>
              Plak deze code in de Arduino IDE. WiFi-gegevens moeten nog handmatig worden ingevuld.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <div className="relative h-full">
              <pre className="absolute inset-0 bg-slate-950 text-slate-50 p-4 rounded-lg overflow-auto text-[11px] font-mono leading-relaxed border-2 border-slate-800">
                {generatedCode}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
