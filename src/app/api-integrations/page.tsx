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
  Code
} from 'lucide-react';
import { 
  useFirestore, 
  useMemoFirebase, 
  useDoc, 
  setDocumentNonBlocking 
} from '@/firebase';
import { doc } from 'firebase/firestore';
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

export default function ApiIntegrationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const apiSettingsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'api_settings') : null, [firestore]);
  const { data: apiSettings, isLoading: isLoadingSettings } = useDoc<any>(apiSettingsRef);

  const handleGenerateKey = async () => {
    if (!apiSettingsRef) return;
    const newKey = `bh_sk_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
    await setDocumentNonBlocking(apiSettingsRef, {
        publicKey: newKey,
        updatedAt: new Date().toISOString()
    }, { merge: true });
    toast({ title: "Nieuwe API Key gegenereerd" });
  };

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/v1/data` : '';

  const fullJsonExample = {
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
    "longitude": 4.8952
  };

  if (isLoadingSettings) return <LoadingScreen message="REST HUB laden..." />;

  const apiModules = [
    { 
        id: 'meldingen', 
        label: 'Meldingen', 
        icon: List, 
        color: 'text-primary',
        methods: [
            { method: 'GET', label: 'Lijst ophalen', path: '?type=meldingen', desc: 'Haal alle actieve meldingen op.' },
            { method: 'GET', label: 'Item ophalen', path: '?type=meldingen&id={id}', desc: 'Haal één specifieke melding op.' }
        ],
        views: [
            { label: 'Portaal (Nieuw)', params: 'status=Nieuw' },
            { label: 'Openstaand (Actief)', params: 'status=Intern doorgezet,In behandeling,Gepland op korte termijn,Gepland op langere termijn,Extern doorgezet' },
            { label: 'Archief (Historie)', params: 'status=Afgerond,Niet in beheer,Geweigerd,Dubbel gemeld' }
        ]
    },
    { 
        id: 'settings', 
        label: 'Systeem Configuratie', 
        icon: Settings, 
        color: 'text-orange-500',
        methods: [
            { method: 'GET', label: 'Meldingsopties Uitlezen', path: '?type=settings&id=issue_options', desc: 'Haal actuele Hoofdtypes, Subtypes en Statussen op.' }
        ],
        views: []
    },
    { 
        id: 'objects', 
        label: 'Objecten', 
        icon: MapPin, 
        color: 'text-green-600',
        methods: [
            { method: 'GET', label: 'Lijst ophalen', path: '?type=objects', desc: 'Haal objecten/assets op.' }
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
            { method: 'GET', label: 'Lijst ophalen', path: '?type=voertuigen', desc: 'Alle voertuigen uitlezen.' }
        ],
        views: [
            { label: 'Operationeel', params: 'status=Actief' },
            { label: 'In Onderhoud', params: 'status=In onderhoud' }
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
            { label: 'Toezichthouders', params: 'role=toezichthouder' },
            { label: 'Medewerkers', params: 'role=medewerkers' }
        ]
    }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="REST API HUB" description="Extraheer data naar externe systemen. Schrijf-acties via POST zijn uitgeschakeld." />

      <ScrollArea className="flex-1">
        <div className="w-full space-y-0 pb-20">
          <Card className="rounded-none border-none shadow-none bg-white overflow-hidden">
            <CardHeader className="bg-white border-b p-8 text-slate-900">
              <div className="flex items-center gap-4">
                <div className="bg-primary p-3 rounded-none shadow-lg shadow-primary/20"><Share2 className="h-6 w-6 text-white" /></div>
                <div>
                  <CardTitle className="text-xl font-black uppercase tracking-tight">Data Provider Hub (Read-Only)</CardTitle>
                  <CardDescription className="text-slate-500 font-bold uppercase text-[9px] tracking-widest">Alle data-extractie endpoints voor externe koppelingen.</CardDescription>
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

              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3 flex items-center gap-2">
                        <Database className="h-4 w-4 text-primary" /> Beschikbare Endpoints (GET Only)
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
                                                        <Badge className="rounded-none font-black text-[10px] px-3 h-6 border-none bg-blue-500 text-white">GET</Badge>
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
                                            <p className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2 tracking-widest"><Sparkles className="h-3 w-3 text-primary" /> Deep Links (Gefilterde Extractie)</p>
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

                <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-tight border-b-2 border-slate-900 pb-3 flex items-center gap-2">
                        <Code className="h-4 w-4 text-primary" /> Data Schema Reference
                    </h3>
                    <Card className="rounded-none border-2 border-slate-100 bg-white overflow-hidden">
                        <CardHeader className="p-6 bg-slate-50 border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-black uppercase tracking-tight">Melding Object (Full Schema)</CardTitle>
                                    <CardDescription className="text-[10px] font-bold uppercase text-slate-400">Gebruik dit JSON-schema voor een 1:1 koppeling bij extractie.</CardDescription>
                                </div>
                                <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase border-slate-300" onClick={() => { navigator.clipboard.writeText(JSON.stringify(fullJsonExample, null, 2)); toast({ title: "Gekopieerd" }); }}>
                                    <Copy className="h-3 w-3 mr-1.5" /> Kopieer JSON
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="p-6 bg-slate-900 text-blue-400 font-mono text-[10px] leading-relaxed shadow-inner overflow-hidden border-[6px] border-slate-800">
                                <pre className="whitespace-pre-wrap font-bold">
                                    {JSON.stringify(fullJsonExample, null, 2)}
                                </pre>
                            </div>
                        </CardContent>
                    </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
