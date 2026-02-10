'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Cpu, Wifi, Database, Terminal, Send, Copy, Check, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { firebaseConfig } from '@/firebase/config';
import { generateIoTCode } from '@/ai/flows/generate-iot-code-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function IoTPage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedCode, setGeneratedCode] = React.useState<string | null>(null);
  const [explanation, setExplanation] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const handleGenerateCode = async () => {
    if (!prompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Instructie leeg',
        description: 'Voer eerst een instructie in voor de AI.',
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

      setGeneratedCode(result.code);
      setExplanation(result.explanation);
      toast({
        title: 'Code gegenereerd',
        description: 'De ESP32-code is succesvol aangemaakt.',
      });
    } catch (error: any) {
      console.error('Error generating code:', error);
      toast({
        variant: 'destructive',
        title: 'Generatie mislukt',
        description: error.message || 'Er is een fout opgetreden bij het aanroepen van de AI.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Gekopieerd',
        description: 'De code is naar het klembord gekopieerd.',
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-background overflow-y-auto">
      <PageHeader 
        title="IoT Dashboard & Integratie" 
        description="Monitor de status van je verbonden sensoren en hardware-gateways."
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-8">
        <div className="xl:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Vraag het de AI
              </CardTitle>
              <CardDescription>
                Omschrijf wat je wilt bouwen. De AI zorgt voor de juiste Firebase-configuratie.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Jouw Instructie</label>
                <Textarea 
                  placeholder="Bijv: Maak een programma dat de vulgraad van een prullenbak meet met een ultrasoon sensor en dit elke 10 minuten opslaat..." 
                  className="min-h-[150px] text-sm"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleGenerateCode}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Code genereren...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Genereer ESP32 Code
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800 dark:text-blue-400 font-bold">Automatische Configuratie</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-500">
              De AI vult automatisch je Project ID en API Key in de code in voor directe communicatie met je database.
            </AlertDescription>
          </Alert>
        </div>

        <div className="xl:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Arduino / C++ Code
                </CardTitle>
                <CardDescription>Volledig geconfigureerd voor jouw project.</CardDescription>
              </div>
              {generatedCode && (
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Gekopieerd' : 'Kopieer'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              {generatedCode ? (
                <div className="flex-1 flex flex-col gap-4">
                  {explanation && (
                    <div className="bg-muted p-3 rounded-md text-sm italic">
                      {explanation}
                    </div>
                  )}
                  <pre className="flex-1 bg-zinc-950 text-zinc-50 p-4 rounded-md overflow-auto font-mono text-xs leading-relaxed">
                    {generatedCode}
                  </pre>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed rounded-md p-12">
                  <Cpu className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-lg font-medium">Nog geen code gegenereerd</p>
                  <p className="text-sm">Geef links een instructie om te beginnen.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
