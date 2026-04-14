
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Key, 
  Copy, 
  Share2, 
  Globe, 
  Truck, 
  Users, 
  MapPin, 
  List, 
  Sparkles,
  Database,
  Settings,
  Code,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { 
  useFirestore, 
  useMemoFirebase, 
  useDoc, 
  setDocumentNonBlocking, 
  useCollection,
  updateDocumentNonBlocking,
  deleteDocumentNonBlocking
} from '@/firebase';
import { doc, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { LoadingScreen } from '@/components/loading-screen';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ApiIntegrationDialog } from '@/components/api-integration-dialog';
import { triggerWebhookSync } from './actions';
import type { ApiIntegration } from '@/lib/types';

export default function ApiIntegrationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedIntegration, setSelectedIntegration] = React.useState<ApiIntegration | null>(null);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);

  const apiSettingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'api_settings') : null, [firestore]);
  const { data: apiSettings, isLoading: isLoadingSettings } = useDoc<any>(apiSettingsRef);

  const integrationsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'api_integrations') : null, [firestore]);
  const { data: integrations, isLoading: isLoadingIntegrations } = useCollection<ApiIntegration>(integrationsQuery);

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
    if (!firestore || syncingId) return;
    setSyncingId(integration.id);
    
    try {
        const headers = integration.headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {});
        const result = await triggerWebhookSync(integration.endpoint, 'GET', headers, null);

        if (result.success) {
            let externalData;
            try {
                externalData = JSON.parse(result.responseText);
            } catch (e) {
                throw new Error("Respons van de server is geen geldig JSON-formaat.");
            }

            const items = Array.isArray(externalData) ? externalData : (externalData.data || [externalData]);
            const batch = writeBatch(firestore);
            const targetCol = collection(firestore, integration.sourceModule);
            
            let count = 0;
            items.forEach((item: any) => {
                const mappedData: any = { 
                    updatedAt: serverTimestamp(),
                    source: 'API_SYNC' 
                };
                
                Object.entries(integration.mapping).forEach(([fsKey, apiKey]) => {
                    if (item[apiKey] !== undefined) mappedData[fsKey] = item[apiKey];
                });

                // Identifying key logic: use mapped 'intakenummer', 'id', or original external ID
                const docId = mappedData.intakenummer || mappedData.id || item.id || item.ID || null;
                if (docId) {
                    const docRef = doc(targetCol, String(docId));
                    batch.set(docRef, mappedData, { merge: true });
                    count++;
                }
            });

            await batch.commit();
            
            await updateDocumentNonBlocking(doc(firestore, 'api_integrations', integration.id), {
                lastRun: new Date().toISOString(),
                lastStatus: 'success',
                lastResponse: `Succesvol: ${count} items verwerkt.`
            });

            toast({ title: "Synchronisatie geslaagd", description: `${count} records bijgewerkt in ${integration.sourceModule}.` });
        } else {
            throw new Error(result.responseText || "Onbekende netwerkfout.");
        }
    } catch (err: any) {
        console.error("Sync error:", err);
        await updateDocumentNonBlocking(doc(firestore, 'api_integrations', integration.id), {
            lastRun: new Date().toISOString(),
            lastStatus: 'error',
            lastResponse: err.message
        });
        toast({ variant: 'destructive', title: "Synchronisatie mislukt", description: err.message });
    } finally {
        setSyncingId(null);
    }
  };

  const handleDeleteIntegration = (id: string) => {
    if (!firestore) return;
    deleteDocumentNonBlocking(doc(firestore, 'api_integrations', id));
    toast({ title: "Koppeling verwijderd" });
  };

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/data` : '';

  if (isLoadingSettings || isLoadingIntegrations) return <LoadingScreen message="REST HUB laden..." />;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="REST API HUB" description="Extraheer data of koppel externe Excel/Cloud bronnen voor real-time synchronisatie.">
        <Button onClick={() => { setSelectedIntegration(null); setIsDialogOpen(true); }} className="font-black h-10 uppercase rounded-none shadow-xl shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" /> Nieuwe Koppeling
        </Button>
      </PageHeader>

      <ScrollArea className="flex-1">
        <div className="w-full space-y-0 pb-20">
          <Card className="rounded-none border-none shadow-none bg-white overflow-hidden">
            <CardHeader className="bg-white border-b p-8 text-slate-900">
              <div className="flex items-center gap-4">
                <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20"><Share2 className="h-6 w-6 text-white" /></div>
                <div>
                  <CardTitle className="text-xl font-black uppercase tracking-tight">Data Integration Center</CardTitle>
                  <CardDescription className="text-slate-500 font-bold uppercase text-[9px] tracking-widest">Alle inkomende en uitgaande data stromen.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              
              {/* API KEY SECTION */}
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

              {/* ACTIVE INTEGRATIONS SECTION */}
              <div className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3 flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" /> Actieve Koppelingen (Sync)
                </h3>
                
                <div className="grid gap-4">
                    {integrations?.map(int => (
                        <div key={int.id} className="p-6 bg-white border-2 border-slate-100 rounded-none flex items-center justify-between hover:border-primary/20 transition-all shadow-sm">
                            <div className="flex items-center gap-6 flex-1 min-w-0">
                                <div className={cn(
                                    "h-12 w-12 rounded-none flex items-center justify-center shrink-0 shadow-inner",
                                    int.method === 'GET' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                                )}>
                                    <Globe className="h-6 w-6" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h4 className="font-black uppercase tracking-tight text-slate-900 truncate">{int.name}</h4>
                                        <Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-1.5 border-slate-200">{int.method}</Badge>
                                        <Badge className="bg-slate-900 text-white text-[8px] font-black uppercase h-4 px-1.5">{int.sourceModule}</Badge>
                                    </div>
                                    <p className="text-[10px] font-mono text-slate-400 truncate max-w-md">{int.endpoint}</p>
                                    {int.lastRun && (
                                        <div className="flex items-center gap-3 mt-2">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Laatst gedraaid: {formatDate(new Date(int.lastRun), 'dd MMM HH:mm')}</span>
                                            {int.lastStatus === 'success' ? (
                                                <Badge className="bg-green-100 text-green-700 h-4 text-[8px] font-black uppercase border-none"><CheckCircle2 className="h-2.5 w-2.5 mr-1" /> OK</Badge>
                                            ) : (
                                                <TooltipProvider>
                                                    <Badge variant="destructive" className="h-4 text-[8px] font-black uppercase cursor-help"><AlertCircle className="h-2.5 w-2.5 mr-1" /> ERROR</Badge>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {int.method === 'GET' && (
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-10 px-4 font-black uppercase text-[10px] rounded-none border-slate-200 hover:bg-primary hover:text-white hover:border-primary transition-all"
                                        onClick={() => handleRunSync(int)}
                                        disabled={syncingId === int.id}
                                    >
                                        {syncingId === int.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                                        Sync Nu
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-primary rounded-none" onClick={() => { setSelectedIntegration(int); setIsDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-300 hover:text-red-600 rounded-none" onClick={() => handleDeleteIntegration(int.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    ))}
                    {(!integrations || integrations.length === 0) && (
                        <div className="p-12 text-center bg-slate-50 border-2 border-dashed rounded-none">
                            <Database className="h-12 w-12 mx-auto mb-4 text-slate-200" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nog geen externe koppelingen ingesteld</p>
                        </div>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-8">
                {/* SYSTEM ENDPOINTS */}
                <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3 flex items-center gap-2">
                        <Code className="h-4 w-4 text-primary" /> Systeem Endpoints (Data Provider)
                    </h3>
                    <Accordion type="single" collapsible className="w-full space-y-4">
                        {[
                            { id: 'meldingen', label: 'Meldingen', icon: List, path: '?type=meldingen' },
                            { id: 'objects', label: 'Objecten', icon: MapPin, path: '?type=objects' },
                            { id: 'users', label: 'Personeel', icon: Users, path: '?type=users' },
                            { id: 'voertuigen', label: 'Wagenpark', icon: Truck, path: '?type=voertuigen' }
                        ].map(mod => (
                            <AccordionItem key={mod.id} value={mod.id} className="border-2 border-slate-100 rounded-none overflow-hidden bg-white px-0 group shadow-sm">
                                <AccordionTrigger className="hover:no-underline px-6 py-5 bg-slate-50/50 group-data-[state=open]:bg-primary group-data-[state=open]:text-white transition-all">
                                    <div className="flex items-center gap-4">
                                        <mod.icon className="h-6 w-6 group-data-[state=open]:text-white" />
                                        <span className="text-lg font-black uppercase tracking-tight">{mod.label}</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-6 bg-white border-t-2 border-slate-50 space-y-4">
                                    <div className="flex items-center gap-3">
                                        <Badge className="bg-blue-500 text-white font-black text-[9px] h-5 rounded-none px-2">GET ONLY</Badge>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Public Endpoint</span>
                                    </div>
                                    <div className="flex gap-0 group/url">
                                        <Input value={`${baseUrl}${mod.path}`} readOnly className="h-10 font-mono text-[11px] bg-slate-900 border-none rounded-none text-blue-400 font-bold flex-1" />
                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-none bg-slate-800 text-white hover:bg-primary border-l border-white/5" onClick={() => { navigator.clipboard.writeText(`${baseUrl}${mod.path}`); toast({ title: "URL Gekopieerd" }); }}><Copy className="h-4 w-4" /></Button>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>

                {/* DATA SCHEMA REFERENCE */}
                <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Data Schema Reference
                    </h3>
                    <Card className="rounded-none border-2 border-slate-100 bg-white overflow-hidden">
                        <CardHeader className="p-6 bg-slate-50 border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-black uppercase tracking-tight">Melding Object (JSON)</CardTitle>
                                    <CardDescription className="text-[10px] font-bold uppercase text-slate-400">Schema voor 1:1 koppeling bij extractie of sync.</CardDescription>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase border-slate-300 rounded-none" onClick={() => { navigator.clipboard.writeText(JSON.stringify(FULL_JSON_EXAMPLE, null, 2)); toast({ title: "Gekopieerd" }); }}>
                                    <Copy className="h-3 w-3 mr-1.5" /> Kopieer JSON
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="p-6 bg-slate-900 text-blue-400 font-mono text-[10px] leading-relaxed shadow-inner overflow-hidden border-[6px] border-slate-800 h-[400px]">
                                <ScrollArea className="h-full">
                                    <pre className="whitespace-pre-wrap font-bold">
                                        {JSON.stringify(FULL_JSON_EXAMPLE, null, 2)}
                                    </pre>
                                </ScrollArea>
                            </div>
                        </CardContent>
                    </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      <ApiIntegrationDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        integration={selectedIntegration} 
      />
    </div>
  );
}

const FULL_JSON_EXAMPLE = {
    "intakenummer": "20240101-0001",
    "extern_meldingsnummer": "EXT-123",
    "containernummer": "CP-999",
    "soort_melder": "Inwoner",
    "hoofdcategorie": "Afval",
    "subcategorie": "Zwerfvuil",
    "behandelende_afdeling": "Reiniging",
    "behandelaar": "Jan Jansen",
    "aangenomen_door": "Extern Systeem",
    "status": "Nieuw",
    "voorvaldatum": "2024-01-01",
    "voorvaltijd": "10:30",
    "meldingsdatum": "2024-01-01",
    "meldingsuur": "10:35",
    "straatnaam": "Hoofdstraat",
    "huisnummer": "10",
    "postcode": "1234 AB",
    "plaats": "Amsterdam",
    "wijk": "Centrum",
    "werkgebied": "Gebied 1",
    "melder": "P. de Vries",
    "telefoon_melder": "0612345678",
    "email_melder": "p.devries@email.nl",
    "burgerservicenummer": "123456789",
    "extra_informatie": "Beschrijving van de melding...",
    "latitude": 52.3702,
    "longitude": 4.8952,
    "source": "EXTERNAL_API",
    "updatedAt": "2024-01-01T10:30:00Z"
};
