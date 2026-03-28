'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Link2, 
  Plus, 
  Trash2, 
  Loader2, 
  Settings2, 
  Play, 
  CheckCircle2, 
  Code, 
  ArrowRight,
  Database,
  Globe,
  Search,
  ChevronRight,
  Zap,
  Info,
  Key,
  Copy,
  RefreshCw,
  Terminal,
  Cpu,
  Activity,
  ArrowUpRight,
  Download,
  Share2,
  ShieldCheck,
  Webhook,
  AlertTriangle
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, updateDocumentNonBlocking, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import type { ApiIntegration } from '@/lib/types';
import { ApiIntegrationDialog } from '@/components/api-integration-dialog';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { LoadingScreen } from '@/components/loading-screen';
import { triggerWebhookSync } from './actions';

export default function ApiIntegrationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('outbound');

  const integrationsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'api_integrations'), orderBy('updatedAt', 'desc'));
  }, [firestore]);

  const { data: integrations, isLoading } = useCollection<ApiIntegration>(integrationsQuery);

  const apiSettingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'api_settings') : null, [firestore]);
  const { data: apiSettings, isLoading: isLoadingSettings } = useDoc<any>(apiSettingsRef);

  const selectedIntegration = React.useMemo(() => 
    integrations?.find(i => i.id === selectedId), 
    [integrations, selectedId]
  );

  const handleGenerateKey = async () => {
    if (!apiSettingsRef) return;
    const newKey = `bh_sk_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
    await setDocumentNonBlocking(apiSettingsRef, {
        publicKey: newKey,
        updatedAt: new Date().toISOString()
    }, { merge: true });
    toast({ title: "Nieuwe API Key gegenereerd" });
  };

  const handleRunSync = async (integration: ApiIntegration) => {
    if (!firestore) return;
    setIsProcessing(true);
    toast({ title: "REST Request gestart" });
    
    try {
        const sourceCol = collection(firestore, integration.sourceModule);
        const q = query(sourceCol, limit(100));
        const snapshot = await getDocs(q);
        const sourceData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const payload = sourceData.map(item => {
            const fullPayload = { ...item };
            Object.entries(integration.mapping).forEach(([fsKey, apiKey]) => {
                const val = (item as any)[fsKey.trim()];
                if (val !== undefined) {
                    fullPayload[apiKey.trim()] = val;
                }
            });
            return fullPayload;
        }).filter(item => Object.keys(item).length > 1);

        if (payload.length === 0) {
            toast({ variant: 'destructive', title: "Geen data" });
            setIsProcessing(false);
            return;
        }

        const result = await triggerWebhookSync(
            integration.endpoint,
            integration.method,
            integration.headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {}),
            payload
        );

        await updateDocumentNonBlocking(doc(firestore, 'api_integrations', integration.id), {
            lastRun: new Date().toISOString(),
            lastStatus: result.success ? 'success' : 'error',
            lastResponse: String(result.responseText).slice(0, 1000)
        });

        if (result.success) toast({ title: "Synchronisatie geslaagd" });
        else toast({ variant: 'destructive', title: "Fout bij verzenden" });
    } catch (err: any) {
        toast({ variant: 'destructive', title: "Kritieke fout", description: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const isLocalEnv = typeof window !== 'undefined' && window.location.hostname.includes('cloudworkstations.dev');
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/data` : '';

  if (isLoading || isLoadingSettings) return <LoadingScreen message="REST HUB laden..." />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="REST API HUB" description="Beheer datastromen en externe systeemkoppelingen.">
        <div className="bg-slate-100 p-1 rounded-none border-2 border-slate-200 shadow-inner flex h-11 w-[400px]">
            <button 
                onClick={() => setActiveTab('outbound')}
                className={cn(
                    "flex-1 text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'outbound' ? "bg-primary text-white shadow-xl" : "text-slate-400 hover:bg-white/50"
                )}
            >
                DATA DISPATCHER (PUSH)
            </button>
            <button 
                onClick={() => setActiveTab('inbound')}
                className={cn(
                    "flex-1 text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'inbound' ? "bg-primary text-white shadow-xl" : "text-slate-400 hover:bg-white/50"
                )}
            >
                DATA PROVIDER (PULL)
            </button>
        </div>
      </PageHeader>

      <div className="flex-1 p-6 overflow-hidden">
        {activeTab === 'outbound' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            <Card className="lg:col-span-4 rounded-none border-none shadow-xl bg-white flex flex-col overflow-hidden">
              <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Services</h3>
                <Button size="sm" variant="outline" onClick={() => { setSelectedId(null); setIsDialogOpen(true); }} className="h-8 text-[9px] font-black uppercase border-primary/30 text-primary">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Nieuw
                </Button>
              </CardHeader>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {integrations?.map(i => (
                    <div 
                      key={i.id} 
                      onClick={() => setSelectedId(i.id)}
                      className={cn(
                        "p-4 rounded-none cursor-pointer transition-all border-2 flex items-center justify-between group",
                        selectedId === i.id ? "bg-primary border-primary text-white shadow-lg" : "bg-white border-transparent hover:bg-slate-50"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-black uppercase text-sm tracking-tight truncate">{i.name}</p>
                        <Badge variant="outline" className={cn("text-[8px] h-4 mt-1 border-none", selectedId === i.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400")}>{i.method} {i.sourceModule}</Badge>
                      </div>
                      <ChevronRight className={cn("h-4 w-4", selectedId === i.id ? "text-white" : "text-slate-200")} />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            <Card className="lg:col-span-8 rounded-none border-none shadow-xl bg-white flex flex-col overflow-hidden">
              {selectedIntegration ? (
                <div className="flex flex-col h-full">
                  <header className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-slate-900 h-12 w-12 rounded-none flex items-center justify-center"><Globe className="text-white h-6 w-6" /></div>
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-tight leading-none mb-1">{selectedIntegration.name}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[300px]">{selectedIntegration.endpoint}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(true)} className="font-black uppercase text-[10px] h-10 border-slate-200">Bewerken</Button>
                      <Button onClick={() => handleRunSync(selectedIntegration)} disabled={isProcessing} className="h-10 px-6 font-black uppercase text-[10px] shadow-xl shadow-primary/20">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} SYNC NU
                      </Button>
                    </div>
                  </header>
                  <ScrollArea className="flex-1 p-8">
                    <div className="space-y-10">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-50 border-2 border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Status</p>
                          <Badge className={cn("rounded-none text-[10px] uppercase font-black border-none", selectedIntegration.lastStatus === 'success' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{selectedIntegration.lastStatus || 'GEEN DATA'}</Badge>
                        </div>
                        <div className="p-4 bg-slate-50 border-2 border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Laatste sync</p>
                          <p className="text-xs font-black">{selectedIntegration.lastRun ? format(new Date(selectedIntegration.lastRun), 'dd MMM HH:mm', { locale: nl }) : '-'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 border-2 border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Source</p>
                          <p className="text-xs font-black uppercase">{selectedIntegration.sourceModule}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-2">Veld Mapping & Aliasing</h3>
                        <div className="bg-blue-50 p-4 border-l-4 border-blue-500 mb-4">
                            <p className="text-[10px] font-bold text-blue-700 uppercase">INFO: De volledige dataset wordt meegestuurd. De onderstaande mapping wordt gebruikt om specifieke velden herkenbaar te maken voor het ontvangende systeem.</p>
                        </div>
                        <div className="grid gap-2">
                          {Object.entries(selectedIntegration.mapping).map(([fs, api]) => (
                            <div key={fs} className="flex items-center justify-between p-3 bg-slate-50 border-2 border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-tighter">
                              <span>SOURCE: <b className="text-slate-900">{fs}</b></span>
                              <ArrowRight className="h-4 w-4 text-slate-300" />
                              <span>ALIAS: <b className="text-primary">{api}</b></span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {selectedIntegration.lastResponse && (
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black uppercase text-slate-400">Laatste Respons</h3>
                            <pre className="p-4 bg-slate-900 text-blue-400 text-[10px] font-mono rounded-none overflow-x-auto">
                                {selectedIntegration.lastResponse}
                            </pre>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                  <ArrowUpRight className="h-16 w-16 opacity-10 mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">Selecteer een service</p>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="max-w-5xl mx-auto space-y-6 pb-20">
              {isLocalEnv && (
                <Alert className="rounded-none border-2 border-orange-200 bg-orange-50/50">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <AlertTitle className="text-xs font-black uppercase text-orange-900">Privé Omgeving (Studio)</AlertTitle>
                    <AlertDescription className="text-[10px] font-bold text-orange-700 leading-relaxed uppercase">
                        Let op: Je werkt momenteel in een beveiligde ontwikkelomgeving. GeoBeheer cloud-servers kunnen deze URL NIET rechtstreeks bereiken door de Google-beveiliging. 
                        Gebruik deze URL's alleen voor lokale tests. De "Failed to fetch" fout zal verdwijnen zodra de app is gepubliceerd op een publiek domein (bijv. .web.app).
                    </AlertDescription>
                </Alert>
              )}

              <Card className="rounded-none border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="bg-slate-900 text-white p-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20"><Share2 className="h-6 w-6 text-white" /></div>
                    <div>
                      <CardTitle className="text-xl font-black uppercase tracking-tight">Data Provider Hub (REST Pull)</CardTitle>
                      <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Laat externe systemen live data uit BeheerHub ophalen.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-10">
                  <div className="p-6 bg-slate-50 border-2 border-slate-100 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Key className="h-3.5 w-3.5 text-primary" /> Authorisatie & Headers</h3>
                      <Button onClick={handleGenerateKey} className="h-10 px-6 text-[10px] font-black uppercase shadow-xl shadow-primary/20 rounded-none bg-primary text-white">GENEREER SLEUTEL</Button>
                    </div>
                    {apiSettings?.publicKey && (
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Secret API Key (X-API-KEY)</Label>
                        <div className="flex">
                          <Input value={apiSettings.publicKey} readOnly className="h-12 font-mono text-sm bg-white border-2 border-slate-200 rounded-none font-bold" />
                          <Button variant="outline" size="icon" className="h-12 w-12 rounded-none border-2 border-l-0" onClick={() => { navigator.clipboard.writeText(apiSettings.publicKey); toast({ title: "Gekopieerd" }); }}><Copy className="h-5 w-5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3">Beschikbare Datasets (GET)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {['meldingen', 'objects', 'projects', 'voertuigen', 'machines'].map(type => (
                        <div key={type} className="p-5 bg-white border-2 border-slate-100 rounded-none hover:border-primary/20 transition-all group">
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-sm font-black uppercase tracking-tight">{type}</span>
                            <Download className="h-4 w-4 text-slate-200 group-hover:text-primary" />
                          </div>
                          <div className="flex gap-0">
                            <Input value={`${baseUrl}?type=${type}`} readOnly className="h-9 font-mono text-[9px] bg-slate-50 border-none rounded-none text-blue-600 font-bold" />
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-none bg-slate-100" onClick={() => { navigator.clipboard.writeText(`${baseUrl}?type=${type}`); toast({ title: "URL Gekopieerd" }); }}><Copy className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3">Test Request (cURL)</h3>
                    <div className="bg-slate-900 p-6 rounded-none relative border-l-4 border-primary shadow-inner">
                      <pre className="text-[11px] font-mono text-blue-400 font-bold leading-relaxed whitespace-pre-wrap break-all">
{`curl -X GET "${baseUrl}?type=meldingen" \\
  -H "x-api-key: ${apiSettings?.publicKey || 'JOUW_SLEUTEL'}" \\
  -H "Content-Type: application/json"`}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        )}
      </div>

      <ApiIntegrationDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} integration={selectedIntegration} />
    </div>
  );
}
