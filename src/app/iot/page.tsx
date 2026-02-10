'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Cpu, Wifi, Database, Terminal, Send, Copy, Check, Loader2, Sparkles, AlertCircle, User, Bot, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { firebaseConfig } from '@/firebase/config';
import { generateIoTCode } from '@/ai/flows/generate-iot-code-flow';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Message = {
  role: 'user' | 'model';
  content: string;
};

export default function IoTPage() {
  const { toast } = useToast();
  const [inputPrompt, setInputPrompt] = React.useState('');
  const [selectedBoard, setSelectedBoard] = React.useState('ESP32');
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedCode, setGeneratedCode] = React.useState<string | null>(null);
  const [explanation, setExplanation] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [messageCount, setMessageCount] = React.useState(0);
  
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load message count from localStorage on mount (simple way to track daily usage)
  React.useEffect(() => {
    const saved = localStorage.getItem('iot_ai_usage_count');
    const lastDate = localStorage.getItem('iot_ai_usage_date');
    const today = new Date().toDateString();

    if (lastDate === today && saved) {
      setMessageCount(parseInt(saved, 10));
    } else {
      localStorage.setItem('iot_ai_usage_date', today);
      localStorage.setItem('iot_ai_usage_count', '0');
      setMessageCount(0);
    }
  }, []);

  const handleGenerateCode = async () => {
    if (!inputPrompt.trim() || isGenerating) return;

    const userMessage = inputPrompt.trim();
    setInputPrompt('');
    setIsGenerating(true);
    
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);

    try {
      const result = await generateIoTCode({
        prompt: userMessage,
        board: selectedBoard,
        history: messages,
        projectId: firebaseConfig.projectId,
        apiKey: firebaseConfig.apiKey,
      });

      setGeneratedCode(result.code);
      setExplanation(result.explanation);
      
      setMessages([...newMessages, { role: 'model', content: result.explanation }]);
      
      const newCount = messageCount + 1;
      setMessageCount(newCount);
      localStorage.setItem('iot_ai_usage_count', newCount.toString());

      toast({
        title: 'Code bijgewerkt',
        description: 'De code is aangepast op basis van je instructie.',
      });
    } catch (error: any) {
      console.error('Error generating code:', error);
      toast({
        variant: 'destructive',
        title: 'Generatie mislukt',
        description: error.message || 'Er is een fout opgetreden.',
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

  const clearChat = () => {
    setMessages([]);
    setGeneratedCode(null);
    setExplanation(null);
  };

  return (
    <div className="flex flex-col flex-1 p-4 min-h-0 bg-background overflow-hidden">
      <PageHeader 
        title="IoT Dashboard & Integratie" 
        description="Monitor status en genereer code voor je hardware-gateways."
        className="p-0 mb-4"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 shadow-none">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Apparaten</p>
              <p className="text-xl font-black">0</p>
            </div>
            <Wifi className="h-5 w-5 text-blue-400" />
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/10 border-green-200 shadow-none">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-green-600">Data Requests</p>
              <p className="text-xl font-black">0</p>
            </div>
            <Database className="h-5 w-5 text-green-400" />
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-900/10 border-purple-200 shadow-none">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Systeem Status</p>
              <p className="text-xl font-black">Online</p>
            </div>
            <Cpu className="h-5 w-5 text-purple-400" />
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-0 overflow-hidden">
        {/* Chat / Assistent Sectie */}
        <Card className="xl:col-span-4 flex flex-col shadow-none overflow-hidden border-muted">
          <CardHeader className="p-3 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-xs font-bold uppercase tracking-tight">IoT-Assistent</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="h-6 text-[10px] font-bold px-2 bg-background/50 border-primary/20">
                      <Zap className="h-3 w-3 mr-1 text-yellow-500 fill-yellow-500" />
                      {messageCount} / 1500
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Gratis dagelijks limiet: 1500 vragen.<br/>Max. 15 vragen per minuut.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Select value={selectedBoard} onValueChange={setSelectedBoard}>
                <SelectTrigger className="h-7 w-28 text-[10px] font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ESP32">ESP32</SelectItem>
                  <SelectItem value="ESP8266">ESP8266</SelectItem>
                  <SelectItem value="Arduino Nano RP2040">RP2040 Connect</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearChat} title="Wis gesprek">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          
          <ScrollArea className="flex-1 p-3 bg-slate-50 dark:bg-slate-900/20" ref={scrollRef}>
            <div className="space-y-3 pb-4">
              {messages.length === 0 ? (
                <div className="text-center py-10 opacity-40">
                  <Bot className="h-10 w-10 mx-auto mb-2" />
                  <p className="text-[11px] font-medium">Stel een vraag om te beginnen met coderen voor de {selectedBoard}.</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={cn("flex flex-col gap-1 max-w-[90%]", msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                    <div className="flex items-center gap-1.5 px-1">
                      {msg.role === 'user' ? <User className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5 text-primary" />}
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{msg.role === 'user' ? 'Jij' : 'Assistent'}</span>
                    </div>
                    <div className={cn(
                      "p-2 rounded-lg text-[11px] leading-relaxed shadow-sm",
                      msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-card border border-muted"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isGenerating && (
                <div className="flex flex-col gap-1 mr-auto items-start max-w-[90%]">
                  <div className="flex items-center gap-1.5 px-1">
                    <Bot className="h-2.5 w-2.5 text-primary animate-pulse" />
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Assistent</span>
                  </div>
                  <div className="p-2 rounded-lg bg-card border border-muted flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-[11px] italic">Code genereren...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-3 border-t bg-card">
            <div className="relative">
              <Textarea 
                placeholder={`Vraag bijv: Maak een programma dat de vulgraad meet...`} 
                className="min-h-[80px] text-xs resize-none pr-10"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateCode();
                  }
                }}
              />
              <Button 
                size="icon" 
                className="absolute right-2 bottom-2 h-7 w-7" 
                onClick={handleGenerateCode}
                disabled={isGenerating || !inputPrompt.trim() || messageCount >= 1500}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-blue-500" />
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">
                AI gebruikt actuele Firebase-config van dit project.
              </p>
            </div>
          </div>
        </Card>

        {/* Code Weergave Sectie */}
        <Card className="xl:col-span-8 flex flex-col shadow-none border-muted overflow-hidden">
          <CardHeader className="p-3 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <CardTitle className="text-xs font-bold uppercase tracking-tight">Arduino Code</CardTitle>
            </div>
            {generatedCode && (
              <Button variant="outline" size="sm" className="h-7 text-[10px] font-bold px-3" onClick={handleCopy}>
                {copied ? <Check className="mr-1.5 h-3 w-3 text-green-600" /> : <Copy className="mr-1.5 h-3 w-3" />}
                {copied ? 'Gekopieerd' : 'Kopieer'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1 p-0 relative bg-zinc-950">
            {generatedCode ? (
              <ScrollArea className="h-full w-full">
                <pre className="p-4 text-zinc-50 font-mono text-[10px] leading-tight selection:bg-primary/30">
                  {generatedCode}
                </pre>
              </ScrollArea>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground/40">
                <Cpu className="h-12 w-12 mb-3 opacity-10" />
                <p className="text-xs font-bold uppercase tracking-widest">Wachten op instructie</p>
                <p className="text-[10px]">De gegenereerde C++ code verschijnt hier.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
