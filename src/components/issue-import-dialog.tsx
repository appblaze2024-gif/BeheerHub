
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle, Loader2, Table as TableIcon, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ScrollArea } from './ui/scroll-area';

interface IssueImportDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const issueFields = [
    { id: 'intakenummer', label: 'Meldingsnummer' },
    { id: 'extern_meldingsnummer', label: 'Extern Nummer' },
    { id: 'containernummer', label: 'Containernummer' },
    { id: 'hoofdcategorie', label: 'Hoofdcategorie' },
    { id: 'subcategorie', label: 'Subcategorie / Fractie' },
    { id: 'straatnaam', label: 'Straatnaam' },
    { id: 'huisnummer', label: 'Huisnummer' },
    { id: 'plaats', label: 'Plaats' },
    { id: 'extra_informatie', label: 'Omschrijving / Memo' },
    { id: 'melder', label: 'Naam Melder' },
    { id: 'datum', label: 'Datum (JJJJ-MM-DD)' },
    { id: 'tijdstip', label: 'Tijdstip (UU:MM)' },
];

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export function IssueImportDialog({
  children,
  open,
  onOpenChange,
  onSuccess,
}: IssueImportDialogProps) {
  const firestore = useFirestore();
  const [step, setStep] = React.useState(1);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [data, setData] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setHeaders([]);
        setData([]);
        setMapping({});
        setIsImporting(false);
        setImportProgress(0);
        setError(null);
      }, 300);
    }
  }, [open]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const buffer = e.target?.result as ArrayBuffer;
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (json.length === 0) {
                setError("Bestand is leeg.");
                return;
            }

            const fileHeaders = json[0].map(String);
            const fileData = json.slice(1).map(row => row.map(val => val !== null && val !== undefined ? String(val) : ''));

            setHeaders(fileHeaders);
            setData(fileData);

            // Auto-map logic
            const newMapping: Record<string, string> = {};
            issueFields.forEach(field => {
                const found = fileHeaders.find(h => 
                  h.toLowerCase().includes(field.id.toLowerCase()) || 
                  h.toLowerCase().includes(field.label.toLowerCase()) ||
                  (field.id === 'subcategorie' && h.toLowerCase().includes('fractie'))
                );
                if (found) newMapping[field.id] = found;
            });
            setMapping(newMapping);
            setStep(2);
        } catch (err) {
            setError("Fout bij inlezen bestand.");
        }
    };
    reader.readAsArrayBuffer(file);
  };

  const geocode = async (address: string) => {
    try {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`);
        const geo = await res.json();
        if (geo.features?.length > 0) return { lng: geo.features[0].center[0], lat: geo.features[0].center[1] };
    } catch (e) {}
    return { lng: 0, lat: 0 };
  };

  const handleImport = async () => {
    if (!firestore || data.length === 0) return;
    setIsImporting(true);
    
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => headerMap[h] = i);

    try {
        // Fetch current options to check for new subtypes
        const optionsRef = doc(firestore, 'settings', 'issue_options');
        const optionsSnap = await getDoc(optionsRef);
        const currentOptions = optionsSnap.exists() ? optionsSnap.data() : { hoofdcategorieen: [], subcategorieen: {} };
        const subcategorieen = currentOptions.subcategorieen || {};
        let optionsChanged = false;

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const issueData: any = {
                status: 'Nieuw',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };

            issueFields.forEach(f => {
                const colName = mapping[f.id];
                if (colName && headerMap[colName] !== undefined) {
                    issueData[f.id] = row[headerMap[colName]];
                }
            });

            // Automatic Subtype (Fractie) logic
            const hc = issueData.hoofdcategorie || 'Afval'; // Default to Afval if hoofdcategorie is not provided
            const sc = issueData.subcategorie;
            
            if (sc && hc) {
                if (!subcategorieen[hc]) subcategorieen[hc] = [];
                if (!subcategorieen[hc].includes(sc)) {
                    subcategorieen[hc].push(sc);
                    optionsChanged = true;
                }
            }

            const address = `${issueData.straatnaam || ''} ${issueData.huisnummer || ''}, ${issueData.plaats || ''}`.trim();
            if (address.length > 5) {
                const coords = await geocode(address);
                issueData.latitude = coords.lat;
                issueData.longitude = coords.lng;
            }

            await addDocumentNonBlocking(collection(firestore, 'meldingen'), issueData);
            setImportProgress(((i + 1) / data.length) * 100);
        }

        // Save updated options if new subtypes were added
        if (optionsChanged) {
            updateDocumentNonBlocking(optionsRef, { subcategorieen });
        }

        setStep(3);
        onSuccess();
    } catch (err) {
        console.error("Import error:", err);
        setError("Import mislukt.");
    } finally {
        setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-none border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white rounded-none">
          <DialogTitle className="text-xl font-black uppercase tracking-tight">CSV / EXCEL Import</DialogTitle>
          <DialogDescription className="text-slate-400 font-bold">Importeer meldingen met containernummers en fracties.</DialogDescription>
        </DialogHeader>

        <div className="p-6">
            {isImporting ? (
                <div className="py-12 flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="font-black uppercase text-sm">Opdrachten verwerken...</p>
                    <Progress value={importProgress} className="w-full h-2" />
                </div>
            ) : step === 1 ? (
                <div className="py-8 space-y-4">
                    <div className="p-12 border-2 border-dashed border-slate-200 rounded-none flex flex-col items-center gap-4 bg-slate-50/50">
                        <FileSpreadsheet className="h-12 w-12 text-slate-300" />
                        <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="max-w-xs" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Selecteer uw CSV of Excel bestand</p>
                    </div>
                    {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                </div>
            ) : step === 2 ? (
                <div className="space-y-6">
                    <ScrollArea className="max-h-[350px] pr-4">
                        <div className="grid gap-4">
                            {issueFields.map(f => (
                                <div key={f.id} className="grid grid-cols-2 items-center gap-4 border-b border-slate-100 pb-2">
                                    <Label className="text-xs font-black uppercase text-slate-500">{f.label}</Label>
                                    <Select value={mapping[f.id]} onValueChange={v => setMapping(prev => ({...prev, [f.id]: v}))}>
                                        <SelectTrigger className="h-9 text-xs font-bold rounded-none"><SelectValue placeholder="Koppel kolom..." /></SelectTrigger>
                                        <SelectContent className="rounded-none">
                                            <SelectItem value="--ignore--" className="rounded-none">-- Overslaan --</SelectItem>
                                            {headers.filter(h => !!h).map(h => <SelectItem key={h} value={h} className="rounded-none">{h}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <Alert className="rounded-none border-primary/20 bg-primary/5">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <AlertTitle className="text-xs font-black uppercase">Nieuwe Fracties</AlertTitle>
                        <AlertDescription className="text-[10px] font-bold text-slate-500">
                            Onbekende fracties worden automatisch toegevoegd aan de subtypes.
                        </AlertDescription>
                    </Alert>
                </div>
            ) : (
                <div className="py-12 flex flex-col items-center gap-4">
                    <div className="h-20 w-20 rounded-none bg-green-100 flex items-center justify-center">
                        <CheckCircle className="h-12 w-12 text-green-600" />
                    </div>
                    <p className="font-black uppercase text-xl">Import Voltooid!</p>
                    <p className="text-slate-500 font-medium text-center">De opdrachten zijn toegevoegd aan het portaal en eventuele nieuwe fracties zijn geregistreerd.</p>
                </div>
            )}
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50 rounded-none">
            {step === 2 && (
                <>
                    <Button variant="ghost" onClick={() => setStep(1)} className="font-bold rounded-none">Terug</Button>
                    <Button onClick={handleImport} className="font-black uppercase tracking-tight px-8 rounded-none">Importeer {data.length} regels</Button>
                </>
            )}
            {step === 3 && <Button onClick={() => onOpenChange(false)} className="w-full font-black uppercase rounded-none">Sluiten</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
