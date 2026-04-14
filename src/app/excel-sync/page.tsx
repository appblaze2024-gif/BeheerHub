
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  FileSpreadsheet, 
  RefreshCw, 
  Cloud, 
  Download, 
  Plus, 
  Trash2, 
  Check, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  Table as TableIcon,
  Save,
  Link as LinkIcon
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, updateDocumentNonBlocking, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, writeBatch, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { triggerWebhookSync } from '@/app/api-integrations/actions';

export default function ExcelSyncPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [selectedDataset, setSelectedCategory] = React.useState<'meldingen' | 'objects' | 'users'>('meldingen');
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [cloudUrl, setCloudUrl] = React.useState('');
  
  // Local editable grid state
  const [gridData, setGridData] = React.useState<any[]>([]);
  const [isLoadingGrid, setIsLoadingGrid] = React.useState(true);

  const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'excel_sync_config') : null, [firestore]);
  const { data: config } = useDoc<any>(configRef);

  const dataQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, selectedDataset), limit(100));
  }, [firestore, selectedDataset]);

  const { data: remoteData, isLoading: isLoadingData } = useCollection<any>(dataQuery);

  React.useEffect(() => {
    if (config?.cloudUrls?.[selectedDataset]) {
        setCloudUrl(config.cloudUrls[selectedDataset]);
    } else {
        setCloudUrl('');
    }
  }, [config, selectedDataset]);

  React.useEffect(() => {
    if (remoteData) {
        setGridData(remoteData);
        setIsLoadingGrid(false);
    }
  }, [remoteData]);

  const handleSaveGrid = async () => {
    if (!firestore || gridData.length === 0) return;
    setIsSyncing(true);
    const batch = writeBatch(firestore);
    
    try {
        gridData.forEach(item => {
            if (item.id) {
                const docRef = doc(firestore, selectedDataset, item.id);
                const { id, ...data } = item;
                batch.update(docRef, { ...data, updatedAt: serverTimestamp() });
            }
        });
        await batch.commit();
        toast({ title: "Grid opgeslagen", description: "Alle wijzigingen zijn doorgevoerd in de database." });
    } catch (e) {
        toast({ variant: 'destructive', title: "Fout bij opslaan" });
    } finally {
        setIsSyncing(false);
    }
  };

  const handlePullFromCloud = async () => {
    if (!cloudUrl || isSyncing) return;
    setIsSyncing(true);
    
    try {
        const result = await triggerWebhookSync(cloudUrl, 'GET', {}, null);
        if (result.success) {
            let externalData;
            try {
                externalData = JSON.parse(result.responseText);
            } catch (e) {
                throw new Error("Bestand is geen geldig JSON-formaat. Gebruik een API of JSON-link.");
            }

            const items = Array.isArray(externalData) ? externalData : (externalData.data || [externalData]);
            const batch = writeBatch(firestore!);
            
            items.forEach((item: any) => {
                const id = item.id || item.ID || item.intakenummer || null;
                if (id) {
                    const docRef = doc(firestore!, selectedDataset, String(id));
                    batch.set(docRef, { ...item, updatedAt: serverTimestamp(), source: 'EXCEL_SYNC' }, { merge: true });
                }
            });

            await batch.commit();
            toast({ title: "Synchronisatie geslaagd", description: `${items.length} items bijgewerkt uit cloud-bron.` });
        } else {
            throw new Error(result.responseText);
        }
    } catch (err: any) {
        toast({ variant: 'destructive', title: "Sync mislukt", description: err.message });
    } finally {
        setIsSyncing(false);
    }
  };

  const handleExportToExcel = () => {
    if (gridData.length === 0) return;
    setIsExporting(true);
    try {
        const worksheet = XLSX.utils.json_to_sheet(gridData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, selectedDataset);
        XLSX.writeFile(workbook, `BeheerHub_${selectedDataset}_${formatDate(new Date(), 'yyyy-MM-dd')}.xlsx`);
        toast({ title: "Export voltooid" });
    } catch (e) {
        toast({ variant: 'destructive', title: "Export mislukt" });
    } finally {
        setIsExporting(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!configRef) return;
    const currentUrls = config?.cloudUrls || {};
    await setDocumentNonBlocking(configRef, {
        cloudUrls: { ...currentUrls, [selectedDataset]: cloudUrl }
    }, { merge: true });
    toast({ title: "URL opgeslagen" });
  };

  const updateCell = (index: number, field: string, value: string) => {
    const next = [...gridData];
    next[index] = { ...next[index], [field]: value };
    setGridData(next);
  };

  const columns = gridData.length > 0 ? Object.keys(gridData[0]).filter(k => k !== 'id' && k !== 'updatedAt' && k !== 'createdAt') : [];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="Excel Sync Hub" description="Tweerichtings-communicatie tussen BeheerHub en Excel/Cloud bronnen.">
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportToExcel} disabled={isExporting} className="font-bold h-10 border-slate-200 rounded-none bg-white">
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export naar Excel
            </Button>
            <Button onClick={handleSaveGrid} disabled={isSyncing} className="font-black h-10 uppercase rounded-none shadow-xl shadow-primary/20">
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Opslaan in DB
            </Button>
        </div>
      </PageHeader>

      <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 shrink-0">
            <Card className="lg:col-span-4 rounded-none border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="p-6 border-b bg-slate-50/50">
                    <CardTitle className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><TableIcon className="h-3.5 w-3.5" /> Dataset Selectie</CardTitle>
                </CardHeader>
                <CardContent className="p-4 flex flex-col gap-2">
                    <Button variant={selectedDataset === 'meldingen' ? 'default' : 'ghost'} className="w-full justify-between h-12 rounded-none font-black uppercase text-xs" onClick={() => setSelectedCategory('meldingen')}>
                        Meldingen Portaal <Badge variant="secondary" className="bg-slate-100">{selectedDataset === 'meldingen' ? gridData.length : '-'}</Badge>
                    </Button>
                    <Button variant={selectedDataset === 'objects' ? 'default' : 'ghost'} className="w-full justify-between h-12 rounded-none font-black uppercase text-xs" onClick={() => setSelectedCategory('objects')}>
                        GIS Objecten <Badge variant="secondary" className="bg-slate-100">{selectedDataset === 'objects' ? gridData.length : '-'}</Badge>
                    </Button>
                    <Button variant={selectedDataset === 'users' ? 'default' : 'ghost'} className="w-full justify-between h-12 rounded-none font-black uppercase text-xs" onClick={() => setSelectedCategory('users')}>
                        Personeelslijst <Badge variant="secondary" className="bg-slate-100">{selectedDataset === 'users' ? gridData.length : '-'}</Badge>
                    </Button>
                </CardContent>
            </Card>

            <Card className="lg:col-span-8 rounded-none border-none shadow-xl bg-white overflow-hidden">
                <CardHeader className="p-6 border-b bg-slate-900 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-primary p-2 rounded-none"><Cloud className="h-5 w-5 text-white" /></div>
                            <div>
                                <CardTitle className="text-base font-black uppercase tracking-tight">Cloud Sync Config</CardTitle>
                                <CardDescription className="text-[10px] font-bold text-slate-400 uppercase">Koppel direct aan Google Sheets of OneDrive.</CardDescription>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase border-white/20 text-white hover:bg-white/10 rounded-none" onClick={handlePullFromCloud} disabled={!cloudUrl || isSyncing}>
                            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                            Sync Nu
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Cloud Download URL (JSON/CSV Endpoint)</Label>
                        <div className="flex gap-2">
                            <Input 
                                placeholder="https://sheets.googleapis.com/v4/spreadsheets/..." 
                                className="h-12 font-mono text-xs border-2 rounded-none bg-slate-50 focus:ring-primary/20"
                                value={cloudUrl}
                                onChange={e => setCloudUrl(e.target.value)}
                            />
                            <Button variant="secondary" className="h-12 px-6 rounded-none font-black uppercase text-xs" onClick={handleSaveUrl}><LinkIcon className="mr-2 h-4 w-4" /> Koppel</Button>
                        </div>
                        <div className="flex items-center gap-3 p-4 bg-blue-50 border-2 border-blue-100 rounded-none">
                            <Info className="h-4 w-4 text-primary shrink-0" />
                            <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase tracking-tight">
                                Tip: Gebruik een public link of een API-endpoint die JSON teruggeeft voor real-time synchronisatie.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

        <Card className="flex-1 flex flex-col rounded-none border-none shadow-2xl bg-white overflow-hidden">
            <CardHeader className="p-4 border-b bg-slate-50 flex flex-row items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <TableIcon className="h-5 w-5 text-primary" />
                    <h3 className="text-sm font-black uppercase tracking-tight">Live Editable Grid</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{gridData.length} records in view</span>
                </div>
            </CardHeader>
            <div className="flex-1 overflow-auto relative">
                {isLoadingGrid ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-50">
                        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
                    </div>
                ) : gridData.length > 0 ? (
                    <table className="w-full border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-100 z-10 shadow-sm">
                            <tr className="border-b-2 border-slate-200 h-10">
                                <th className="p-2 border-r font-black uppercase text-[10px] text-slate-500 bg-slate-100 w-12 text-center">#</th>
                                {columns.map(col => (
                                    <th key={col} className="p-2 border-r font-black uppercase text-[10px] text-slate-500 text-left min-w-[150px]">{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {gridData.map((row, idx) => (
                                <tr key={row.id || idx} className="border-b hover:bg-slate-50 transition-colors h-10">
                                    <td className="p-2 border-r text-center font-bold text-slate-300">{idx + 1}</td>
                                    {columns.map(col => (
                                        <td key={`${row.id}-${col}`} className="p-0 border-r focus-within:ring-2 focus-within:ring-primary/30">
                                            <input 
                                                value={row[col] || ''} 
                                                onChange={e => updateCell(idx, col, e.target.value)}
                                                className="w-full h-10 px-2 bg-transparent border-none focus:outline-none font-medium text-slate-700"
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-20 text-center flex flex-col items-center gap-4">
                        <AlertCircle className="h-12 w-12 text-slate-200" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Geen data beschikbaar om te bewerken</p>
                    </div>
                )}
            </div>
        </Card>
      </div>
    </div>
  );
}
