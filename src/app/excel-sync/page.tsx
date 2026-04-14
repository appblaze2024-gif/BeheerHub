
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
  Trash2, 
  Check, 
  AlertCircle, 
  Loader2, 
  Table as TableIcon,
  Save,
  Link as LinkIcon,
  Info,
  Send,
  ArrowUpRight
} from 'lucide-react';
import { useFirestore, useMemoFirebase, useDoc, setDocumentNonBlocking } from '@/firebase';
import { doc, query, collection, limit } from 'firebase/firestore';
import { useToast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { triggerWebhookSync, fetchExternalData } from '@/app/api-integrations/actions';

export default function ExcelSyncPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [cloudUrl, setCloudUrl] = React.useState('');
  const [webhookUrl, setWebhookUrl] = React.useState('');
  
  const [gridData, setGridData] = React.useState<any[]>([]);
  const [isLoadingGrid, setIsLoadingGrid] = React.useState(false);

  const configRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'excel_sync_config') : null, [firestore]);
  const { data: config } = useDoc<any>(configRef);

  React.useEffect(() => {
    if (config) {
        setCloudUrl(config.cloudUrl || '');
        setWebhookUrl(config.webhookUrl || '');
    }
  }, [config]);

  const handlePullFromCloud = async () => {
    if (!cloudUrl || isSyncing) return;
    setIsSyncing(true);
    setIsLoadingGrid(true);
    
    try {
        const result = await fetchExternalData(cloudUrl, {});
        if (result.success) {
            let items: any[] = [];
            
            if (result.data) {
                items = Array.isArray(result.data) ? result.data : (result.data.data || [result.data]);
            } else if (result.text) {
                // Try to parse CSV if it's text
                try {
                    const workbook = XLSX.read(result.text, { type: 'string' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    items = XLSX.utils.sheet_to_json(sheet);
                } catch (e) {
                    throw new Error("Bestand kon niet worden geparsed als Excel/CSV. Controleer de link.");
                }
            }

            if (items.length === 0) throw new Error("Geen data gevonden in het bestand.");

            setGridData(items);
            toast({ title: "Data opgehaald", description: `${items.length} rijen geladen uit cloud-bron.` });
        } else {
            throw new Error(result.message || "Kon de URL niet bereiken.");
        }
    } catch (err: any) {
        toast({ variant: 'destructive', title: "Sync mislukt", description: err.message });
    } finally {
        setIsSyncing(false);
        setIsLoadingGrid(false);
    }
  };

  const handlePushToCloud = async () => {
    if (!webhookUrl || gridData.length === 0 || isSyncing) return;
    setIsSyncing(true);
    
    try {
        const result = await triggerWebhookSync(webhookUrl, 'POST', {}, gridData);
        if (result.success) {
            toast({ title: "Verzonden naar Cloud", description: "De data is succesvol teruggestuurd naar de geconfigureerde bron." });
        } else {
            throw new Error(result.responseText);
        }
    } catch (err: any) {
        toast({ variant: 'destructive', title: "Push mislukt", description: err.message });
    } finally {
        setIsSyncing(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!configRef) return;
    await setDocumentNonBlocking(configRef, {
        cloudUrl,
        webhookUrl
    }, { merge: true });
    toast({ title: "Configuratie opgeslagen" });
  };

  const handleExportToExcel = () => {
    if (gridData.length === 0) return;
    setIsExporting(true);
    try {
        const worksheet = XLSX.utils.json_to_sheet(gridData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "CloudData");
        XLSX.writeFile(workbook, `BeheerHub_CloudSync_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
        toast({ title: "Lokaal opgeslagen" });
    } catch (e) {
        toast({ variant: 'destructive', title: "Export mislukt" });
    } finally {
        setIsExporting(false);
    }
  };

  const updateCell = (index: number, field: string, value: string) => {
    const next = [...gridData];
    next[index] = { ...next[index], [field]: value };
    setGridData(next);
  };

  const columns = gridData.length > 0 ? Object.keys(gridData[0]).filter(k => k !== 'updatedAt' && k !== 'createdAt') : [];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      <PageHeader title="Excel Cloud Hub" description="Communiceer rechtstreeks met externe Excel-bestanden en Cloud-bronnen.">
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportToExcel} disabled={isExporting || gridData.length === 0} className="font-bold h-10 border-slate-200 rounded-none bg-white">
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download XLSX
            </Button>
            <Button onClick={handlePushToCloud} disabled={isSyncing || !webhookUrl || gridData.length === 0} className="font-black h-10 uppercase rounded-none shadow-xl shadow-primary/20 gap-2">
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                Opslaan naar Cloud
            </Button>
        </div>
      </PageHeader>

      <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 gap-6">
        <Card className="rounded-none border-none shadow-xl bg-white overflow-hidden shrink-0">
            <CardHeader className="p-6 border-b bg-slate-900 text-white flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-primary p-2 rounded-none"><Cloud className="h-5 w-5 text-white" /></div>
                    <div>
                        <CardTitle className="text-base font-black uppercase tracking-tight">Cloud Verbinding</CardTitle>
                        <CardDescription className="text-[10px] font-bold text-slate-400 uppercase">Koppel direct aan Google Sheets, Airtable of OneDrive.</CardDescription>
                    </div>
                </div>
                <Button variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase border-white/20 text-white hover:bg-white/10 rounded-none" onClick={handlePullFromCloud} disabled={!cloudUrl || isSyncing}>
                    {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
                    Ophalen uit Cloud
                </Button>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Bron URL (Input)</Label>
                        <div className="flex gap-2">
                            <Input 
                                placeholder="URL naar JSON/CSV of API endpoint..." 
                                className="h-12 font-mono text-xs border-2 rounded-none bg-slate-50 focus:ring-primary/20"
                                value={cloudUrl}
                                onChange={e => setCloudUrl(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Webhook URL (Save/Push)</Label>
                        <div className="flex gap-2">
                            <Input 
                                placeholder="URL voor POST verzoek bij opslaan..." 
                                className="h-12 font-mono text-xs border-2 rounded-none bg-slate-50 focus:ring-primary/20"
                                value={webhookUrl}
                                onChange={e => setWebhookUrl(e.target.value)}
                            />
                            <Button variant="secondary" className="h-12 px-6 rounded-none font-black uppercase text-xs" onClick={handleSaveConfig}><Save className="mr-2 h-4 w-4" /> Bewaar Config</Button>
                        </div>
                    </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-blue-50 border-2 border-blue-100 rounded-none mt-6">
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase tracking-tight">
                            Voor SharePoint/Excel Online links: Gebruik een Power Automate Flow of Zapier om de Excel-data te ontsluiten als een JSON-endpoint.
                        </p>
                        <p className="text-[9px] text-blue-600 font-medium leading-relaxed italic">
                            Microsoft blokkeert directe toegang tot de Excel-viewer URL's via externe scripts om veiligheidsredenen (CORS).
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card className="flex-1 flex flex-col rounded-none border-none shadow-2xl bg-white overflow-hidden">
            <CardHeader className="p-4 border-b bg-slate-50 flex flex-row items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <TableIcon className="h-5 w-5 text-primary" />
                    <h3 className="text-sm font-black uppercase tracking-tight">Interactief Raster (Excel-modus)</h3>
                </div>
                {gridData.length > 0 && <Badge variant="outline" className="font-black text-[10px]">{gridData.length} records geladen</Badge>}
            </CardHeader>
            <div className="flex-1 overflow-auto relative">
                {isLoadingGrid ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-50 gap-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="font-black uppercase tracking-widest text-xs">Cloud data inladen...</p>
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
                                        <td key={`${row.id || idx}-${col}`} className="p-0 border-r focus-within:ring-2 focus-within:ring-primary/30">
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
                    <div className="p-20 text-center flex flex-col items-center justify-center h-full gap-4">
                        <div className="p-8 bg-slate-50 rounded-none border-2 border-dashed border-slate-200">
                            <FileSpreadsheet className="h-12 w-12 text-slate-200" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Koppel een URL en klik op 'Ophalen' om te beginnen</p>
                    </div>
                )}
            </div>
        </Card>
      </div>
    </div>
  );
}
