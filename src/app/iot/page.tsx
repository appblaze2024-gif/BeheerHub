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
    <div className="flex flex-col flex-1 p-4 min-h-0 bg-background overflow-y-auto">
      <PageHeader 
        title="IoT Dashboard & Integratie" 
        description="Monitor de status van je verbonden sensoren en hardware-gateways."
        className="p-0 mb-4"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 shadow-none">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-bold flex items-center gap-2 uppercase tracking-wider text-blue-600">
              <Wifi className="h-3.5 w-3.5" />
              Apparaten
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-xl font-black">0</p>
            <p className="text-[10px] text-muted-foreground">Geen actieve sensoren</p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/10 border-green-200 shadow-none">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-bold flex items-center gap-2 uppercase tracking-wider text-green-600">
              <Database className="h-3.5 w-3.5" />
              Data Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-xl font-black">0</p>
            <p className="text-[10px] text-muted-foreground">Laatste 24 uur</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-900/10 border-purple-200 shadow-none">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-bold flex items-center gap-2 uppercase tracking-wider text-purple-600">
              <Cpu className="h-3.5 w-3.5" />
              Systeem Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-xl font-black">Online</p>
            <p className="text-[10px] text-muted-foreground">Gateway is operationeel</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <div className="xl:col-span-1 space-y-4">
          <Card className="shadow-none">
            <CardHeader className="p-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                IoT-Assistent
              </CardTitle>
              <CardDescription className="text-xs">
                Omschrijf de functie van je ESP32. De AI regelt de rest.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase text-muted-foreground">Jouw Instructie</label>
                <Textarea 
                  placeholder="Bijv: Maak een programma dat de vulgraad meet met een TOF400C sensor..." 
                  className="min-h-[120px] text-xs resize-none"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>
              <Button 
                className="w-full h-8 text-xs font-bold" 
                onClick={handleGenerateCode}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Genereren...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-3.5 w-3.5" />
                    Genereer ESP32 Code
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 py-2 px-3">
            <AlertCircle className="h-3.5 w-3.5 text-blue-600 top-2.5" />
            <AlertTitle className="text-blue-800 dark:text-blue-400 font-bold text-[11px] ml-1">Configuratie</AlertTitle>
            <AlertDescription className="text-blue-700 dark:text-blue-500 text-[10px] ml-1">
              Project ID en API Key worden automatisch ingevuld in de gegenereerde code.
            </AlertDescription>
          </Alert>
        </div>

        <div className="xl:col-span-2">
          <Card className="h-full flex flex-col shadow-none">
            <CardHeader className="flex flex-row items-center justify-between p-4 py-3 border-b">
              <div className="space-y-0.5">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Terminal className="h-4 w-4" />
                  Arduino Code
                </CardTitle>
                <CardDescription className="text-[10px]">Direct klaar voor gebruik.</CardDescription>
              </div>
              {generatedCode && (
                <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={handleCopy}>
                  {copied ? <Check className="mr-1.5 h-3 w-3 text-green-600" /> : <Copy className="mr-1.5 h-3 w-3" />}
                  {copied ? 'Gekopieerd' : 'Kopieer'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 p-3 pt-3">
              {generatedCode ? (
                <div className="flex-1 flex flex-col gap-2 min-h-0">
                  {explanation && (
                    <div className="bg-muted/50 p-2 rounded border text-[11px] leading-relaxed italic text-muted-foreground">
                      {explanation}
                    </div>
                  )}
                  <div className="flex-1 relative min-h-[300px]">
                    <pre className="absolute inset-0 bg-zinc-950 text-zinc-50 p-3 rounded overflow-auto font-mono text-[10px] leading-tight selection:bg-primary/30">
                      {generatedCode}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground border-2 border-dashed rounded-md p-8">
                  <Cpu className="h-10 w-10 mb-3 opacity-10" />
                  <p className="text-sm font-medium">Wachten op instructie</p>
                  <p className="text-[10px]">Voer links je wensen in om code te genereren.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
