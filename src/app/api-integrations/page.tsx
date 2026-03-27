
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
  MoreVertical,
  History,
  ChevronRight,
  Key,
  ShieldCheck,
  Copy,
  Terminal,
  Server,
  Zap,
  Info,
  HelpCircle,
  ArrowDown,
  ChevronDown
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, updateDocumentNonBlocking, setDocumentNonBlocking, useDoc } from '@/firebase';
import { collection, doc, query, orderBy, getDocs } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { ApiIntegration } from '@/lib/types';
import { ApiIntegrationDialog } from '@/components/api-integration-dialog';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingScreen } from '@/components/loading-screen';
import { Separator } from '@/components/ui/separator';

export default function ApiIntegrationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const apiSettingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'api_settings') : null, [firestore]);
  const { data: apiSettings, isLoading: isLoadingSettings } = useDoc<any>(apiSettingsRef);

  const integrationsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'api_integrations'), orderBy('name', 'asc'));
  }, [firestore]);

  const { data: integrations, isLoading } = useCollection<ApiIntegration>(integrationsQuery);

  const selectedIntegration = React.useMemo(() => 
    integrations?.find(i => i.id === selectedId), 
    [integrations, selectedId]
  );

  const filteredIntegrations = React.useMemo(() => {
    if (!integrations) return [];
    if (!searchTerm.trim()) return integrations;
    const q = searchTerm.toLowerCase();
    return integrations.filter(i => i.name.toLowerCase().includes(q) || i.endpoint.toLowerCase().includes(q));
  }, [integrations, searchTerm]);

  const handleGenerateKey = async () => {
    if (!apiSettingsRef) return;
    const newKey = 'bh_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await setDocumentNonBlocking(apiSettingsRef, {
        publicKey: newKey,
        updatedAt: new Date().toISOString()
    }, { merge: true });
    toast({ title: "Nieuwe API Key gegenereerd" });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Gekopieerd naar klembord" });
  };

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    await deleteDocumentNonBlocking(doc(firestore, 'api_integrations', id));
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Koppeling verwijderd" });
  };

  const handleRunSync = async (integration: ApiIntegration) => {
    setIsProcessing(true);
    toast({ title: "Synchronisatie gestart" });
    
    try {
        const sourceCol = collection(firestore!, integration.sourceModule);
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

        await updateDocumentNonBlocking(doc(firestore!, 'api_integrations', integration.id), {
            lastRun: new Date().toISOString(),
            lastStatus: status,
            lastResponse: responseText.slice(0, 500)
        });

        if (response.ok) {
            toast({ title: "Synchronisatie geslaagd" });
        } else {
            toast({ variant: 'destructive', title: "Fout bij verzenden" });
        }
    } catch (err: any) {
        console.error("Sync error:", err);
        toast({ variant: 'destructive', title: "Kritieke fout", description: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const publicApiUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/data?type=meldingen` : '';

  if (isLoading || isLoadingSettings) return <LoadingScreen message="API Dashboard laden..." />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="API & Koppelingen" description="Beheer zowel uitgaande webhooks als inkomende data-aanvragen.">
        <Button onClick={() => { setSelectedId(null); setIsDialogOpen(true); }} className="font-black h-10 uppercase rounded-none">
          <Plus className="mr-2 h-4 w-4" /> Nieuwe Webhook
        </Button>
      </PageHeader>

      <div className="flex-1 p-4 md:p-6 min-h-0 overflow-hidden">
        <Tabs defaultValue="webhooks" className="h-full flex flex-col">
          <TabsList className="bg-white border p-1 h-12 rounded-none w-full md:w-fit mb-6">
            <TabsTrigger value="webhooks" className="rounded-none px-8 font-black uppercase text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white">
              <Zap className="mr-2 h-4 w-4" /> Uitgaand (Webhooks)
            </TabsTrigger>
            <TabsTrigger value="public-api" className="rounded-none px-8 font-black uppercase text-[10px] data-[state=active]:bg-primary data-[state=active]:text-white">
              <Server className="mr-2 h-4 w-4" /> Inkomend (Public API)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="webhooks" className="flex-1 min-h-0 m-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full overflow-hidden">
                <Card className="lg:col-span-4 flex flex-col rounded-none border-none shadow-xl bg-white overflow-hidden">
                    <CardHeader className="p-4 border-b bg-slate-50/50">
                        <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input 
                            placeholder="Zoek webhook..." 
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

                <Card className="lg:col-span-8 flex flex-col rounded-none border-none shadow-xl bg-white overflow-hidden">
                    {selectedIntegration ? (
                        <div className="flex flex-col h-full">
                        <header className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                            <div className="bg-primary h-12 w-12 rounded-none flex items-center justify-center shadow-lg shadow-primary/20">
                                <Globe className="text-white h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black uppercase tracking-tight leading-none mb-1">{selectedIntegration.name}</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-md">{selectedIntegration.endpoint}</p>
                            </div>
                            </div>
                            <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={() => setIsDialogOpen(true)} className="font-bold h-9 border-slate-200 rounded-none">
                                <Settings2 className="mr-2 h-4 w-4" /> Aanpassen
                            </Button>
                            <Button onClick={() => handleRunSync(selectedIntegration)} disabled={isProcessing} className="h-9 font-black uppercase shadow-lg shadow-primary/20 rounded-none bg-primary text-white">
                                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                Sync Nu
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(selectedIntegration.id)} className="text-slate-300 hover:text-red-600">
                                <Trash2 className="h-5 w-5" />
                            </Button>
                            </div>
                        </header>

                        <ScrollArea className="flex-1">
                            <div className="p-8 space-y-8">
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
                                    <Badge className={cn("uppercase font-black text-[9px] border-none rounded-none", selectedIntegration.lastStatus === 'success' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                                        {selectedIntegration.lastStatus || 'Onbekend'}
                                    </Badge>
                                </CardContent>
                                </Card>
                                <Card className="rounded-none border-2 border-slate-100 shadow-none bg-slate-50/30">
                                <CardContent className="p-4">
                                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Bron Module</p>
                                    <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-slate-300 rounded-none">{selectedIntegration.sourceModule}</Badge>
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
                                    <div key={fsKey} className="flex items-center gap-4 p-3 bg-slate-50 border border-slate-100 rounded-none group hover:border-primary/30 transition-colors">
                                    <div className="flex-1 text-xs font-bold text-slate-500 uppercase tracking-tighter">Firestore: <span className="text-slate-900 font-black">{fsKey}</span></div>
                                    <ArrowRight className="h-4 w-4 text-slate-300" />
                                    <div className="flex-1 text-xs font-bold text-slate-500 uppercase tracking-tighter text-right">API Veld: <span className="text-primary font-black">{apiKey}</span></div>
                                    </div>
                                ))}
                                </div>
                            </div>
                            </div>
                        </ScrollArea>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-300">
                        <Link2 className="h-16 w-16 opacity-10 mb-4" />
                        <h3 className="text-xl font-black uppercase tracking-tight text-slate-400">Selecteer een webhook</h3>
                        </div>
                    )}
                </Card>
            </div>
          </TabsContent>

          <TabsContent value="public-api" className="flex-1 min-h-0 m-0">
            <Card className="rounded-none border-none shadow-xl bg-white overflow-hidden h-full flex flex-col">
                <header className="p-8 border-b bg-slate-900 text-white shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20">
                                <ShieldCheck className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tight text-white leading-none mb-1">Public Data API</h2>
                                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Stel externe partijen in staat om BeheerHub data op te vragen of te sturen.</p>
                            </div>
                        </div>
                        <Button onClick={handleGenerateKey} className="h-11 px-8 font-black uppercase tracking-widest rounded-none shadow-xl shadow-primary/20">
                            {apiSettings?.publicKey ? 'Nieuwe Key Genereren' : 'API Activeren'}
                        </Button>
                    </div>
                </header>

                <ScrollArea className="flex-1">
                    <div className="p-8 max-w-4xl space-y-12 pb-20">
                        {/* Explanation Section */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="rounded-none border-2 border-slate-100 p-6 space-y-3">
                                <Globe className="h-6 w-6 text-primary" />
                                <h4 className="text-xs font-black uppercase">URL Endpoint</h4>
                                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Het digitale adres van BeheerHub waar de data wordt opgehaald of afgeleverd.</p>
                            </Card>
                            <Card className="rounded-none border-2 border-slate-100 p-6 space-y-3">
                                <Key className="h-6 w-6 text-primary" />
                                <h4 className="text-xs font-black uppercase">Authenticatie</h4>
                                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Jouw unieke API Key dient als wachtwoord. Zonder deze code krijgt niemand toegang.</p>
                            </Card>
                            <Card className="rounded-none border-2 border-slate-100 p-6 space-y-3">
                                <HelpCircle className="h-6 w-6 text-primary" />
                                <h4 className="text-xs font-black uppercase">Headers</h4>
                                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Dit zijn extra labels bij het bericht die de sleutel en het type data bevatten.</p>
                            </Card>
                        </div>

                        {/* Credentials */}
                        <div className="space-y-6">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-2 flex items-center gap-2">
                                <ShieldCheck className="h-3.5 w-3.5" /> Authenticatie Gegevens
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Uw Geheime API Key</Label>
                                    <div className="flex gap-2">
                                        <Input 
                                            readOnly 
                                            value={apiSettings?.publicKey || 'Nog niet geactiveerd'} 
                                            className="h-12 font-mono text-sm bg-slate-50 border-2 rounded-none font-bold text-primary"
                                        />
                                        <Button variant="outline" size="icon" className="h-12 w-12 rounded-none border-2" onClick={() => copyToClipboard(apiSettings?.publicKey)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase italic">Header naam: <span className="text-slate-900">x-api-key</span></p>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Basis URL Endpoint</Label>
                                    <div className="flex gap-2">
                                        <Input 
                                            readOnly 
                                            value={publicApiUrl} 
                                            className="h-12 font-mono text-[10px] bg-slate-50 border-2 rounded-none font-bold"
                                        />
                                        <Button variant="outline" size="icon" className="h-12 w-12 rounded-none border-2" onClick={() => copyToClipboard(publicApiUrl)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Usage Guide */}
                        <div className="space-y-6">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-2 flex items-center gap-2">
                                <Terminal className="h-3.5 w-3.5" /> Implementatie Voorbeelden
                            </h3>
                            
                            <div className="grid gap-8">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase flex items-center gap-2">
                                        <ArrowDown className="h-4 w-4 text-green-600" /> Data Versturen (Inkomende Webhook)
                                    </h4>
                                    <Card className="rounded-none border-2 bg-slate-50 overflow-hidden">
                                        <CardHeader className="py-3 px-4 bg-slate-900">
                                            <CardTitle className="text-[10px] font-black uppercase text-white">Voorbeeld: Nieuwe melding aanmaken (POST)</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 font-mono text-[11px] text-blue-600 font-bold leading-relaxed">
                                            curl -X POST "{publicApiUrl}" \<br/>
                                            &nbsp;&nbsp;-H "x-api-key: {apiSettings?.publicKey || 'UW_API_KEY'}" \<br/>
                                            &nbsp;&nbsp;-H "Content-Type: application/json" \<br/>
                                            &nbsp;&nbsp;-d '{"{"} "intakenummer": "API-123", "subcategorie": "Losse tegel", "hoofdcategorie": "Wegonderhoud" {"}"}'
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black uppercase flex items-center gap-2">
                                        <ArrowRight className="h-4 w-4 text-primary" /> Data Ophalen (GET)
                                    </h4>
                                    <Card className="rounded-none border-2 bg-slate-50 overflow-hidden">
                                        <CardHeader className="py-3 px-4 bg-slate-900">
                                            <CardTitle className="text-[10px] font-black uppercase text-white">Voorbeeld: Alle objecten opvragen (GET)</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 font-mono text-[11px] text-blue-600 font-bold leading-relaxed">
                                            curl -X GET "{publicApiUrl.replace('meldingen', 'objects')}" \<br/>
                                            &nbsp;&nbsp;-H "x-api-key: {apiSettings?.publicKey || 'UW_API_KEY'}"
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </Card>
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
