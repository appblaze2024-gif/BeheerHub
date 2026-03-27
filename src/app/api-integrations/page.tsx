
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
  XCircle, 
  Code, 
  ArrowRight,
  Database,
  Globe,
  Search,
  ChevronRight,
  Zap,
  Info,
  Server,
  Key,
  Copy,
  RefreshCw,
  Terminal,
  ShieldCheck
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, updateDocumentNonBlocking, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, orderBy, getDocs } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { ApiIntegration } from '@/lib/types';
import { ApiIntegrationDialog } from '@/components/api-integration-dialog';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { LoadingScreen } from '@/components/loading-screen';
import { Separator } from '@/components/ui/separator';

export default function ApiIntegrationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
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

  const filteredIntegrations = React.useMemo(() => {
    if (!integrations) return [];
    if (!searchTerm.trim()) return integrations;
    const q = searchTerm.toLowerCase();
    return integrations.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.endpoint.toLowerCase().includes(q) ||
      i.sourceModule.toLowerCase().includes(q)
    );
  }, [integrations, searchTerm]);

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    await deleteDocumentNonBlocking(doc(firestore, 'api_integrations', id));
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Koppeling verwijderd" });
  };

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
    toast({ title: "Synchronisatie gestart", description: `Data uit ${integration.sourceModule} wordt verzonden.` });
    
    try {
        const sourceCol = collection(firestore, integration.sourceModule);
        const snapshot = await getDocs(sourceCol);
        const sourceData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const payload = sourceData.map(item => {
            const mappedItem: Record<string, any> = {};
            Object.entries(integration.mapping).forEach(([fsKey, apiKey]) => {
                if ((item as any)[fsKey] !== undefined) {
                    mappedItem[apiKey] = (item as any)[fsKey];
                }
            });
            return mappedItem;
        });

        const response = await fetch(integration.endpoint, {
            method: integration.method,
            headers: {
                'Content-Type': 'application/json',
                ...integration.headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {})
            },
            body: JSON.stringify(payload)
        });

        const status = response.ok ? 'success' : 'error';
        const responseText = await response.text();

        await updateDocumentNonBlocking(doc(firestore, 'api_integrations', integration.id), {
            lastRun: new Date().toISOString(),
            lastStatus: status,
            lastResponse: responseText.slice(0, 500)
        });

        if (response.ok) {
            toast({ title: "Synchronisatie geslaagd", description: "De externe server heeft de data ontvangen." });
        } else {
            toast({ variant: 'destructive', title: "Fout bij verzenden", description: `Status: ${response.status}` });
        }
    } catch (err: any) {
        console.error("Sync error:", err);
        toast({ variant: 'destructive', title: "Kritieke fout", description: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const fullBaseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/data` : '';
  const webhookExampleUrl = `${fullBaseUrl}?type=meldingen`;

  if (isLoading || isLoadingSettings) return <LoadingScreen message="Koppelingen laden..." />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="API & Koppelingen" description="Beheer hoe BeheerHub communiceert met de buitenwereld.">
        <div className="bg-slate-100 p-1 rounded-none border-2 border-slate-200 shadow-inner flex h-11 w-64 shrink-0">
            <button 
                onClick={() => setActiveTab('outbound')}
                className={cn(
                    "flex-1 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 rounded-none",
                    activeTab === 'outbound' ? "bg-primary text-white shadow-xl" : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
                )}
            >
                Uitgaand
            </button>
            <button 
                onClick={() => setActiveTab('inbound')}
                className={cn(
                    "flex-1 text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 rounded-none",
                    activeTab === 'inbound' ? "bg-primary text-white shadow-xl" : "text-slate-400 hover:text-slate-600 hover:bg-white/50"
                )}
            >
                Inkomend
            </button>
        </div>
      </PageHeader>

      <div className="flex-1 p-4 md:p-6 min-h-0 overflow-hidden">
        <Tabs value={activeTab} className="h-full">
            <TabsContent value="outbound" className="h-full m-0 animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full overflow-hidden">
                    {/* Sidebar List */}
                    <Card className="lg:col-span-4 flex flex-col rounded-none border-none shadow-xl bg-white overflow-hidden">
                        <CardHeader className="p-4 border-b bg-slate-50/50 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Webhooks</h3>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => { setSelectedId(null); setIsDialogOpen(true); }} className="h-8 text-[10px] font-black uppercase border-primary/30 text-primary bg-primary/5 rounded-none shadow-sm hover:bg-primary hover:text-white transition-all">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Nieuw
                                </Button>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input 
                                    placeholder="Zoek koppeling..." 
                                    className="pl-10 h-10 font-bold rounded-none border-slate-100 bg-white"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </CardHeader>
                        <ScrollArea className="flex-1">
                            <div className="p-2 space-y-1">
                            {filteredIntegrations.map(i => (
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
                                    <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className={cn(
                                        "text-[8px] h-4 uppercase font-black tracking-widest border-none",
                                        selectedId === i.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
                                    )}>{i.sourceModule}</Badge>
                                    {i.lastStatus && (
                                        <div className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        i.lastStatus === 'success' ? "bg-green-400" : "bg-red-400"
                                        )} />
                                    )}
                                    </div>
                                </div>
                                <ChevronRight className={cn(
                                    "h-4 w-4 transition-transform",
                                    selectedId === i.id ? "text-white" : "text-slate-200 group-hover:translate-x-1"
                                )} />
                                </div>
                            ))}
                            </div>
                        </ScrollArea>
                    </Card>

                    {/* Detail View */}
                    <Card className="lg:col-span-8 flex flex-col rounded-none border-none shadow-xl bg-white overflow-hidden">
                        {selectedIntegration ? (
                            <div className="flex flex-col h-full">
                            <header className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                <div className="bg-primary h-12 w-12 rounded-none flex items-center justify-center shadow-lg shadow-primary/20">
                                    <Globe className="text-white h-6 w-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 leading-none mb-1">{selectedIntegration.name}</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-md">{selectedIntegration.endpoint}</p>
                                </div>
                                </div>
                                <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => setIsDialogOpen(true)} className="font-black uppercase text-[10px] h-10 border-slate-200 rounded-none shadow-sm hover:bg-slate-50">
                                    <Settings2 className="mr-2 h-4 w-4" /> Aanpassen
                                </Button>
                                <Button onClick={() => handleRunSync(selectedIntegration)} disabled={isProcessing} className="h-10 px-6 font-black uppercase text-[10px] shadow-xl shadow-primary/20 rounded-none bg-primary text-white hover:bg-primary/90 transition-all active:scale-95">
                                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                    Sync Nu
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(selectedIntegration.id)} className="h-10 w-10 text-slate-300 hover:text-red-600 rounded-none">
                                    <Trash2 className="h-5 w-5" />
                                </Button>
                                </div>
                            </header>

                            <ScrollArea className="flex-1">
                                <div className="p-8 space-y-10">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="rounded-none border-2 border-slate-100 shadow-none bg-slate-50/30">
                                    <CardContent className="p-4">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Laatste Run</p>
                                        <p className="text-sm font-black text-slate-900">
                                        {selectedIntegration.lastRun ? format(new Date(selectedIntegration.lastRun), 'dd MMM HH:mm', { locale: nl }) : 'Nooit'}
                                        </p>
                                    </CardContent>
                                    </Card>
                                    <Card className="rounded-none border-2 border-slate-100 shadow-none bg-slate-50/30">
                                    <CardContent className="p-4">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Status</p>
                                        <Badge className={cn(
                                            "uppercase font-black text-[9px] border-none rounded-none px-3", 
                                            selectedIntegration.lastStatus === 'success' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                        )}>
                                            {selectedIntegration.lastStatus || 'Onbekend'}
                                        </Badge>
                                    </CardContent>
                                    </Card>
                                    <Card className="rounded-none border-2 border-slate-100 shadow-none bg-slate-50/30">
                                    <CardContent className="p-4">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Bron Module</p>
                                        <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-slate-300 rounded-none px-3 bg-white">{selectedIntegration.sourceModule}</Badge>
                                    </CardContent>
                                    </Card>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-2">
                                    <Database className="h-5 w-5 text-primary" />
                                    <h3 className="text-sm font-black uppercase tracking-tight">Veld Mapping</h3>
                                    </div>
                                    <div className="grid gap-2">
                                    {Object.entries(selectedIntegration.mapping).map(([fsKey, apiKey]) => (
                                        <div key={fsKey} className="flex items-center gap-4 p-4 bg-slate-50 border-2 border-slate-100 rounded-none group hover:border-primary/30 transition-colors">
                                        <div className="flex-1 text-xs font-bold text-slate-500 uppercase tracking-tighter">Firestore: <span className="text-slate-900 font-black">{fsKey}</span></div>
                                        <ArrowRight className="h-4 w-4 text-slate-300" />
                                        <div className="flex-1 text-xs font-bold text-slate-500 uppercase tracking-tighter text-right">API Veld: <span className="text-primary font-black">{apiKey}</span></div>
                                        </div>
                                    ))}
                                    </div>
                                </div>

                                {selectedIntegration.lastResponse && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-2">
                                            <Code className="h-5 w-5 text-primary" />
                                            <h3 className="text-sm font-black uppercase tracking-tight">Laatste Respons</h3>
                                        </div>
                                        <div className="p-4 bg-slate-900 rounded-none font-mono text-[10px] text-blue-400 shadow-inner overflow-hidden">
                                            <pre className="whitespace-pre-wrap break-all">{selectedIntegration.lastResponse}</pre>
                                        </div>
                                    </div>
                                )}
                                </div>
                            </ScrollArea>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-300">
                                <div className="bg-slate-50 p-10 rounded-none shadow-inner border-2 border-slate-100 mb-6">
                                    <Server className="h-16 w-16 opacity-10" />
                                </div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-slate-400">Kies een webhook</h3>
                            </div>
                        )}
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="inbound" className="h-full m-0 animate-in fade-in slide-in-from-right-2 duration-300">
                <ScrollArea className="h-full">
                    <div className="max-w-4xl mx-auto space-y-10 pb-20">
                        <Card className="rounded-none border-none shadow-xl bg-white overflow-hidden">
                            <CardHeader className="bg-slate-900 text-white p-8 shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20">
                                        <ShieldCheck className="h-6 w-6 text-white" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-black uppercase tracking-tight">Inkomende Webhook (Inbound)</CardTitle>
                                        <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Genereer een unieke URL om data naar BeheerHub te sturen.</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-8 space-y-10">
                                <div className="bg-blue-50 border-2 border-blue-100 p-6 rounded-none flex items-start gap-4 shadow-inner">
                                    <div className="bg-white p-2 rounded-none shadow-sm"><Info className="h-5 w-5 text-primary shrink-0" /></div>
                                    <div className="space-y-2">
                                        <p className="text-sm font-black uppercase text-slate-900">Hoe werkt het?</p>
                                        <p className="text-xs font-medium text-slate-600 leading-relaxed italic">
                                            Met de inkomende API kunnen externe systemen (zoals sensoren, andere gemeentelijke apps of partners) data direct in BeheerHub schieten. 
                                            Je genereert eenmalig een URL en een API Key die de andere partij in hun systeem instelt.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex items-center justify-between border-b-2 border-slate-100 pb-3">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                            <Key className="h-3.5 w-3.5 text-primary" /> Authenticatie & Sleutelbeheer
                                        </h3>
                                        <Button 
                                            onClick={handleGenerateKey} 
                                            className="h-10 px-6 text-[10px] font-black uppercase shadow-xl shadow-primary/20 rounded-none bg-primary text-white hover:bg-primary/90 transition-all active:scale-95"
                                        >
                                            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Nieuwe sleutel genereren
                                        </Button>
                                    </div>

                                    {apiSettings?.publicKey ? (
                                        <div className="grid gap-8">
                                            <div className="space-y-3">
                                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Uw Geheime API Key</Label>
                                                <div className="flex gap-0 shadow-xl">
                                                    <Input 
                                                        value={apiSettings.publicKey} 
                                                        readOnly 
                                                        className="h-14 font-mono text-sm bg-slate-50 border-2 border-slate-200 rounded-none font-bold focus:ring-0"
                                                    />
                                                    <Button 
                                                        variant="outline" 
                                                        size="icon" 
                                                        className="h-14 w-14 rounded-none border-2 border-l-0 border-slate-200 bg-white hover:bg-slate-50 text-primary transition-colors" 
                                                        onClick={() => { navigator.clipboard.writeText(apiSettings.publicKey); toast({ title: "Gekopieerd" }); }}
                                                    >
                                                        <Copy className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                                <p className="text-[9px] font-black text-red-500 uppercase tracking-widest ml-1 animate-pulse">Let op: Deel deze sleutel nooit met onbevoegden.</p>
                                            </div>

                                            <div className="space-y-3">
                                                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Webhook Endpoint URL</Label>
                                                <div className="flex gap-0 shadow-xl">
                                                    <Input 
                                                        value={webhookExampleUrl} 
                                                        readOnly 
                                                        className="h-14 font-mono text-xs bg-slate-50 border-2 border-slate-200 rounded-none font-bold text-primary focus:ring-0"
                                                    />
                                                    <Button 
                                                        variant="outline" 
                                                        size="icon" 
                                                        className="h-14 w-14 rounded-none border-2 border-l-0 border-slate-200 bg-white hover:bg-slate-50 text-primary transition-colors" 
                                                        onClick={() => { navigator.clipboard.writeText(webhookExampleUrl); toast({ title: "URL Gekopieerd" }); }}
                                                    >
                                                        <Copy className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic ml-1">Tip: Wijzig de "type" parameter naar "objects" of "voertuigen" voor andere data.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-16 text-center border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-none">
                                            <div className="bg-white p-6 rounded-none inline-flex items-center justify-center mb-6 shadow-md border border-slate-100">
                                                <Key className="h-10 w-10 text-slate-200" />
                                            </div>
                                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-6">Er is nog geen API Key geconfigureerd.</p>
                                            <Button onClick={handleGenerateKey} className="font-black uppercase tracking-widest h-12 px-10 shadow-xl shadow-primary/20 rounded-none bg-primary text-white">
                                                Activeer Inbound Webhook
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {apiSettings?.publicKey && (
                                    <div className="space-y-6 pt-4">
                                        <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-3">
                                            <Terminal className="h-5 w-5 text-primary" />
                                            <h3 className="text-sm font-black uppercase tracking-tight">Test Verzoek (cURL)</h3>
                                        </div>
                                        <div className="bg-slate-900 p-8 rounded-none relative group shadow-2xl border border-white/5">
                                            <pre className="text-[11px] font-mono text-blue-400 whitespace-pre-wrap leading-relaxed font-bold">
{`curl -X POST "${webhookExampleUrl}" \\
  -H "x-api-key: ${apiSettings.publicKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "intakenummer": "WEB-12345",
    "subcategorie": "Zwerfvuil",
    "extra_informatie": "Automatisch aangemaakt via Webhook"
  }'`}
                                            </pre>
                                            <Button 
                                                variant="ghost" 
                                                className="absolute top-4 right-4 h-10 px-4 font-black uppercase text-[10px] text-white/40 hover:text-white hover:bg-white/10 rounded-none border border-white/10 transition-all" 
                                                onClick={() => { navigator.clipboard.writeText(`curl -X POST "${webhookExampleUrl}" -H "x-api-key: ${apiSettings.publicKey}" -H "Content-Type: application/json" -d '{"intakenummer": "WEB-12345", "subcategorie": "Zwerfvuil"}'`); toast({ title: "Script gekopieerd" }); }}
                                            >
                                                <Copy className="h-3.5 w-3.5 mr-2" /> Kopiëren
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </ScrollArea>
            </TabsContent>
        </Tabs>
      </div>

      <ApiIntegrationDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        integration={selectedIntegration} 
      />
    </div>
  );
}
