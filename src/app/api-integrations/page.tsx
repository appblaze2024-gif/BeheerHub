
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
  History
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, orderBy, getDocs } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { ApiIntegration } from '@/lib/types';
import { ApiIntegrationDialog } from '@/components/api-integration-dialog';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function ApiIntegrationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

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

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    await deleteDocumentNonBlocking(doc(firestore, 'api_integrations', id));
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Koppeling verwijderd" });
  };

  const handleRunSync = async (integration: ApiIntegration) => {
    setIsProcessing(true);
    toast({ title: "Synchronisatie gestart", description: `Data uit ${integration.sourceModule} wordt verzonden naar ${integration.endpoint}` });
    
    try {
        // Fetch source data based on module
        const sourceCol = collection(firestore!, integration.sourceModule);
        const snapshot = await getDocs(sourceCol);
        const sourceData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Transform data using mapping
        const payload = sourceData.map(item => {
            const mappedItem: Record<string, any> = {};
            Object.entries(integration.mapping).forEach(([fsKey, apiKey]) => {
                if ((item as any)[fsKey] !== undefined) {
                    mappedItem[apiKey] = (item as any)[fsKey];
                }
            });
            return mappedItem;
        });

        // Execute fetch (Note: In production this usually needs a server-side proxy to avoid CORS)
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
            toast({ title: "Synchronisatie geslaagd", description: `${payload.length} records succesvol verzonden.` });
        } else {
            toast({ variant: 'destructive', title: "Fout bij verzenden", description: `Server antwoordde met status ${response.status}` });
        }
    } catch (err: any) {
        console.error("Sync error:", err);
        await updateDocumentNonBlocking(doc(firestore!, 'api_integrations', integration.id), {
            lastRun: new Date().toISOString(),
            lastStatus: 'error',
            lastResponse: err.message
        });
        toast({ variant: 'destructive', title: "Kritieke fout", description: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  if (isLoading) return <div className="p-8">Koppelingen laden...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="API Koppelingen" description="Synchroniseer BeheerHub data met externe systemen.">
        <Button onClick={() => { setSelectedId(null); setIsDialogOpen(true); }} className="font-black h-10 uppercase rounded-none">
          <Plus className="mr-2 h-4 w-4" /> Nieuwe Koppeling
        </Button>
      </PageHeader>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-6 min-h-0 overflow-hidden">
        {/* Sidebar List */}
        <Card className="lg:col-span-4 flex flex-col rounded-none overflow-hidden border-none shadow-xl bg-white">
          <CardHeader className="p-4 border-b bg-slate-50/50">
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
              {filteredIntegrations.length === 0 && (
                <div className="py-12 text-center opacity-20">
                  <Link2 className="h-12 w-12 mx-auto mb-2" />
                  <p className="text-[10px] font-black uppercase">Geen koppelingen gevonden</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Detail View */}
        <Card className="lg:col-span-8 flex flex-col rounded-none overflow-hidden border-none shadow-xl bg-white">
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
                  {/* Status Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="rounded-none border-2 border-slate-100 shadow-none bg-slate-50/30">
                      <CardContent className="p-4">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Laatste Run</p>
                        <p className="text-sm font-black text-slate-900">
                          {selectedIntegration.lastRun ? format(new Date(selectedIntegration.lastRun), 'dd MMM HH:mm', { nl }) : 'Nooit'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="rounded-none border-2 border-slate-100 shadow-none bg-slate-50/30">
                      <CardContent className="p-4">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Status</p>
                        <div className="flex items-center gap-2">
                          {selectedIntegration.lastStatus === 'success' ? (
                            <Badge className="bg-green-100 text-green-700 uppercase font-black text-[9px] border-none rounded-none">Succes</Badge>
                          ) : selectedIntegration.lastStatus === 'error' ? (
                            <Badge className="bg-red-100 text-red-700 uppercase font-black text-[9px] border-none rounded-none">Fout</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-400 uppercase font-black text-[9px] border-none rounded-none">Onbekend</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="rounded-none border-2 border-slate-100 shadow-none bg-slate-50/30">
                      <CardContent className="p-4">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Bron Module</p>
                        <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-slate-300 rounded-none">{selectedIntegration.sourceModule}</Badge>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Mapping Preview */}
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

                  {/* Last Response */}
                  {selectedIntegration.lastResponse && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-2">
                        <Code className="h-5 w-5 text-primary" />
                        <h3 className="text-sm font-black uppercase tracking-tight">Laatste Server Antwoord</h3>
                      </div>
                      <pre className="p-6 bg-slate-900 text-blue-400 rounded-none font-mono text-[10px] overflow-x-auto shadow-inner leading-relaxed">
                        {selectedIntegration.lastResponse}
                      </pre>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-300">
              <div className="bg-slate-50 p-10 rounded-none mb-6">
                <Link2 className="h-16 w-16 opacity-10" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-400 mb-2">Geen koppeling geselecteerd</h3>
              <p className="text-sm font-medium max-w-xs mx-auto leading-relaxed italic">Kies een koppeling uit de lijst om de details te bekijken of een nieuwe synchronisatie te starten.</p>
            </div>
          )}
        </Card>
      </div>

      <ApiIntegrationDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        integration={selectedIntegration} 
      />
    </div>
  );
}
