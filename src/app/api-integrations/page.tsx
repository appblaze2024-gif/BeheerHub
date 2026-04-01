'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Plus, 
  Loader2, 
  Play, 
  ChevronRight, 
  Key, 
  Copy, 
  Share2, 
  AlertTriangle,
  Database,
  Globe,
  Truck,
  Users,
  MapPin,
  Folder,
  ArrowUpRight,
  Zap,
  ArrowRight,
  List,
  Edit2,
  Trash2,
  PlusCircle,
  FileText
} from 'lucide-react';
import { 
  useFirestore, 
  useCollection, 
  useMemoFirebase, 
  updateDocumentNonBlocking, 
  useDoc, 
  setDocumentNonBlocking 
} from '@/firebase';
import { collection, doc, query, orderBy } from 'firebase/firestore';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
    toast({ title: "GET Request gestart" });
    
    try {
        const result = await triggerWebhookSync(
            integration.endpoint,
            'GET',
            integration.headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {}),
            {}
        );

        await updateDocumentNonBlocking(doc(firestore, 'api_integrations', integration.id), {
            lastRun: new Date().toISOString(),
            lastStatus: result.success ? 'success' : 'error',
            lastResponse: String(result.responseText).slice(0, 1000)
        });

        if (result.success) toast({ title: "Synchronisatie geslaagd" });
        else toast({ variant: 'destructive', title: "Fout bij opvragen" });
    } catch (err: any) {
        toast({ variant: 'destructive', title: "Kritieke fout", description: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const isLocalEnv = typeof window !== 'undefined' && window.location.hostname.includes('cloudworkstations.dev');
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/data` : '';

  if (isLoading || isLoadingSettings) return <LoadingScreen message="REST HUB laden..." />;

  const apiModules = [
    { 
        id: 'meldingen', 
        label: 'Meldingen', 
        icon: List, 
        color: 'text-primary',
        methods: [
            { method: 'GET', label: 'Lijst ophalen', path: '?type=meldingen', desc: 'Haal alle actieve meldingen op.' },
            { method: 'GET', label: 'Item ophalen', path: '?type=meldingen&id={id}', desc: 'Haal één specifieke melding op.' },
            { method: 'POST', label: 'Nieuwe melding', path: '?type=meldingen', desc: 'Maak een nieuwe melding aan.' },
            { method: 'PATCH', label: 'Melding bijwerken', path: '?type=meldingen&id={id}', desc: 'Wijzig velden van een melding.' },
            { method: 'DELETE', label: 'Verwijderen', path: '?type=meldingen&id={id}', desc: 'Wis een melding definitief.' }
        ],
        views: [
            { label: 'Portaal (Nieuw)', params: 'status=Nieuw' },
            { label: 'Openstaand (Actief)', params: 'status=Intern doorgezet,In behandeling,Gepland op korte termijn,Gepland op langere termijn,Extern doorgezet' },
            { label: 'Archief (Historie)', params: 'status=Afgerond,Niet in beheer,Geweigerd,Dubbel gemeld' }
        ]
    },
    { 
        id: 'objects', 
        label: 'Objecten', 
        icon: MapPin, 
        color: 'text-green-600',
        methods: [
            { method: 'GET', label: 'Lijst ophalen', path: '?type=objects', desc: 'Haal objecten/assets op.' },
            { method: 'POST', label: 'Nieuw object', path: '?type=objects', desc: 'Registreer een nieuwe unit.' },
            { method: 'PATCH', label: 'Object bijwerken', path: '?type=objects&id={id}', desc: 'Wijzig objectgegevens.' }
        ],
        views: [
            { label: 'Alleen Prullenbakken', params: 'locatieType=prullenbak' },
            { label: 'Alleen Containers', params: 'locatieType=container' }
        ]
    },
    { 
        id: 'voertuigen', 
        label: 'Wagenpark', 
        icon: Truck, 
        color: 'text-blue-600',
        methods: [
            { method: 'GET', label: 'Lijst ophalen', path: '?type=voertuigen', desc: 'Alle voertuigen uitlezen.' },
            { method: 'PATCH', label: 'Status wijzigen', path: '?type=voertuigen&id={id}', desc: 'Bv. status op "In onderhoud" zetten.' }
        ],
        views: [
            { label: 'Operationeel', params: 'status=Actief' }
        ]
    },
    { 
        id: 'users', 
        label: 'Personeel', 
        icon: Users, 
        color: 'text-purple-600',
        methods: [
            { method: 'GET', label: 'Gebruikerslijst', path: '?type=users', desc: 'Lijst van actieve collega\'s.' }
        ],
        views: [
            { label: 'Toezichthouders', params: 'role=toezichthouder' }
        ]
    }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="REST API HUB" description="Beheer volledige CRUD integraties voor externe software partners.">
        <div className="bg-slate-100 p-1 rounded-none border-2 border-slate-200 shadow-inner flex h-11 w-[400px]">
            <button 
                onClick={() => setActiveTab('outbound')}
                className={cn(
                    "flex-1 text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'outbound' ? "bg-primary text-white shadow-xl" : "text-slate-400 hover:bg-white/50"
                )}
            >
                EXTERNAL POLL (OUT)
            </button>
            <button 
                onClick={() => setActiveTab('inbound')}
                className={cn(
                    "flex-1 text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'inbound' ? "bg-primary text-white shadow-xl" : "text-slate-400 hover:bg-white/50"
                )}
            >
                DATA PROVIDER (REST)
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
                        <Badge variant="outline" className={cn("text-[8px] h-4 mt-1 border-none", selectedId === i.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400")}>GET {i.sourceModule}</Badge>
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
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} POLL NU
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
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Laatste poll</p>
                          <p className="text-xs font-black">{selectedIntegration.lastRun ? format(new Date(selectedIntegration.lastRun), 'dd MMM HH:mm', { locale: nl }) : '-'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 border-2 border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Source</p>
                          <p className="text-xs font-black uppercase">{selectedIntegration.sourceModule}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-2">Veld Mapping (Incoming)</h3>
                        <div className="grid gap-2">
                          {Object.entries(selectedIntegration.mapping).map(([fs, api]) => (
                            <div key={fs} className="flex items-center justify-between p-3 bg-slate-50 border-2 border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-tighter">
                              <span>EXTERN: <b className="text-slate-900">{api}</b></span>
                              <ArrowRight className="h-4 w-4 text-slate-300" />
                              <span>BEHEERHUB: <b className="text-primary">{fs}</b></span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {selectedIntegration.lastResponse && (
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-black uppercase text-slate-400">Laatste Respons (Preview)</h3>
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
              <Card className="rounded-none border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="bg-slate-900 text-white p-8">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20"><Share2 className="h-6 w-6 text-white" /></div>
                    <div>
                      <CardTitle className="text-xl font-black uppercase tracking-tight">Data Provider Hub (CRUD)</CardTitle>
                      <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Koppel externe systemen aan de BeheerHub database.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-10">
                  <div className="p-6 bg-slate-50 border-2 border-slate-100 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Key className="h-3.5 w-3.5 text-primary" /> Authorisatie (X-API-KEY)</h3>
                      <Button onClick={handleGenerateKey} className="h-10 px-6 text-[10px] font-black uppercase shadow-xl shadow-primary/20 rounded-none bg-primary text-white">GENEREER SLEUTEL</Button>
                    </div>
                    {apiSettings?.publicKey && (
                      <div className="space-y-3">
                        <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Secret API Key</Label>
                        <div className="flex">
                          <Input value={apiSettings.publicKey} readOnly className="h-12 font-mono text-sm bg-white border-2 border-slate-200 rounded-none font-bold" />
                          <Button variant="outline" size="icon" className="h-12 w-12 rounded-none border-2 border-l-0" onClick={() => { navigator.clipboard.writeText(apiSettings.publicKey); toast({ title: "Gekopieerd" }); }}><Copy className="h-5 w-5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3 flex items-center gap-2">
                        <Database className="h-4 w-4 text-primary" /> Beschikbare Endpoints per Dataset
                    </h3>
                    
                    <Accordion type="single" collapsible className="w-full space-y-4">
                        {apiModules.map(mod => (
                            <AccordionItem key={mod.id} value={mod.id} className="border-2 border-slate-100 rounded-none overflow-hidden bg-white px-0 group shadow-sm">
                                <AccordionTrigger className="hover:no-underline px-6 py-5 bg-slate-50/50 group-data-[state=open]:bg-primary group-data-[state=open]:text-white transition-all">
                                    <div className="flex items-center gap-4">
                                        <mod.icon className={cn("h-6 w-6", mod.color, "group-data-[state=open]:text-white")} />
                                        <span className="text-lg font-black uppercase tracking-tight">{mod.label}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-0 bg-white border-t-2 border-slate-50">
                                    <div className="divide-y divide-slate-100">
                                        {mod.methods.map((m, idx) => (
                                            <div key={idx} className="p-6 space-y-4 hover:bg-slate-50/30 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Badge className={cn(
                                                            "rounded-none font-black text-[10px] px-3 h-6 border-none",
                                                            m.method === 'GET' ? "bg-blue-500 text-white" :
                                                            m.method === 'POST' ? "bg-green-600 text-white" :
                                                            m.method === 'PATCH' ? "bg-orange-500 text-white" :
                                                            "bg-red-600 text-white"
                                                        )}>{m.method}</Badge>
                                                        <span className="text-xs font-black uppercase tracking-tight text-slate-900">{m.label}</span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase italic">{m.desc}</p>
                                                </div>
                                                <div className="flex gap-0 group/url">
                                                    <div className="bg-slate-900 px-3 flex items-center justify-center shrink-0 border-r border-white/10">
                                                        <Globe className="h-3.5 w-3.5 text-slate-500" />
                                                    </div>
                                                    <Input value={`${baseUrl}${m.path}`} readOnly className="h-10 font-mono text-[11px] bg-slate-900 border-none rounded-none text-blue-400 font-bold flex-1" />
                                                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-none bg-slate-800 text-white hover:bg-primary border-l border-white/5" onClick={() => { navigator.clipboard.writeText(`${baseUrl}${m.path}`); toast({ title: "URL Gekopieerd" }); }}><Copy className="h-4 w-4" /></Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {mod.views.length > 0 && (
                                        <div className="p-6 bg-slate-50 border-t-2 border-slate-100 space-y-4">
                                            <p className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest"><Sparkles className="h-3 w-3 text-primary" /> Deep Links (Gefilterde GET)</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {mod.views.map(view => (
                                                    <div key={view.label} className="p-4 bg-white border-2 border-slate-200 rounded-none group/link hover:border-primary/40 transition-all flex flex-col gap-3 shadow-sm">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[11px] font-black uppercase text-slate-700">{view.label}</span>
                                                            <Badge className="bg-blue-50 text-blue-600 text-[8px] font-black border-none rounded-none">READ ONLY</Badge>
                                                        </div>
                                                        <div className="flex gap-0">
                                                            <Input value={`${baseUrl}?type=${mod.id}&${view.params}`} readOnly className="h-8 font-mono text-[9px] bg-slate-50 border-none rounded-none text-slate-500 font-bold" />
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none bg-slate-100 border-l" onClick={() => { navigator.clipboard.writeText(`${baseUrl}?type=${mod.id}&${view.params}`); toast({ title: "Link Gekopieerd" }); }}><Copy className="h-3.5 w-3.5" /></Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
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
