'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Cpu, Wifi, Database, Copy, Check, Code2, Info, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { firebaseConfig } from '@/firebase/config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { generateIoTCode } from '@/ai/flows/generate-iot-code-flow';

export default function IoTPage() {
  const [prompt, setPrompt] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedResult, setGeneratedResult] = React.useState<{ code: string; explanation: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        variant: "destructive",
        title: "Lege vraag",
        description: "Voer a.u.b. een instructie in voor de AI.",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateIoTCode({
        prompt: prompt,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey,
      });
      setGeneratedResult(result);
      toast({
        title: "Code gegenereerd!",
        description: "Je ESP32 code staat voor je klaar.",
      });
    } catch (error: any) {
      console.error("Fout bij genereren:", error);
      toast({
        variant: "destructive",
        title: "Fout bij genereren",
        description: error.message || "Er is iets misgegaan bij het aanroepen van de AI.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedResult?.code) return;
    navigator.clipboard.writeText(generatedResult.code);
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
        title="IoT Dashboard & AI Code Assistant" 
        description="Geef instructies en laat de AI direct werkende ESP32 code voor je project schrijven."
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
                Vraag het de AI
              </CardTitle>
              <CardDescription>
                Omschrijf wat je wilt bouwen. De AI zorgt voor de juiste Firebase-configuratie.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Jouw Instructie</label>
                <Textarea 
                  placeholder="Bijv: Maak een programma dat de vulgraad van prullenbak B001 meet met een HC-SR04 sensor..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[150px]"
                />
              </div>
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating} 
                className="w-full gap-2"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isGenerating ? 'Genereren...' : 'Genereer ESP32 Code'}
              </Button>
              
              {generatedResult?.explanation && (
                <div className="p-3 bg-muted rounded-md text-xs">
                  <p className="font-semibold mb-1">Uitleg:</p>
                  <p className="text-muted-foreground">{generatedResult.explanation}</p>
                </div>
              )}

              <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-xs font-bold text-blue-800 dark:text-blue-400">Automatische Configuratie</AlertTitle>
                <AlertDescription className="text-[10px] text-blue-700 dark:text-blue-500">
                  De AI vult automatisch je Project ID en API Key in de code in voor directe communicatie met je database.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2">
          <Card className="h-full flex flex-col min-h-[500px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Arduino / C++ Code</CardTitle>
                <CardDescription>Volledig geconfigureerd voor jouw project.</CardDescription>
              </div>
              {generatedResult && (
                <Button size="sm" onClick={handleCopy} className="gap-2">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Gekopieerd' : 'Kopieer code'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1">
              <div className="relative h-full min-h-[400px] rounded-md bg-zinc-950 p-4 font-mono text-xs overflow-auto text-zinc-300 border border-zinc-800 shadow-inner">
                {generatedResult ? (
                  <pre><code>{generatedResult.code}</code></pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic">
                    <Code2 className="h-12 w-12 mb-4 opacity-20" />
                    <p>Nog geen code gegenereerd.</p>
                    <p className="text-[10px]">Geef links een instructie om te beginnen.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
