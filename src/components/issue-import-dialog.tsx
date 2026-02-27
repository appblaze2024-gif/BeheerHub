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
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection, serverTimestamp } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle, Loader2, Table as TableIcon, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface IssueImportDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const issueFields = [
    { id: 'intakenummer', label: 'Meldingsnummer' },
    { id: 'extern_meldingsnummer', label: 'Extern Nummer' },
    { id: 'hoofdcategorie', label: 'Hoofdcategorie' },
    { id: 'subcategorie', label: 'Subcategorie' },
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
                const found = fileHeaders.find(h => h.toLowerCase().includes(field.id.toLowerCase()) || h.toLowerCase().includes(field.label.toLowerCase()));
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

            const address = `${issueData.straatnaam || ''} ${issueData.huisnummer || ''}, ${issueData.plaats || ''}`.trim();
            if (address.length > 5) {
                const coords = await geocode(address);
                issueData.latitude = coords.lat;
                issueData.longitude = coords.lng;
            }

            await addDocumentNonBlocking(collection(firestore, 'meldingen'), issueData);
            setImportProgress(((i + 1) / data.length) * 100);
        }
        setStep(3);
        onSuccess();
    } catch (err) {
        setError("Import mislukt.");
    } finally {
        setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-3xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-900 text-white rounded-t-3xl">
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Excel / CSV Import</DialogTitle>
          <DialogDescription className="text-slate-400 font-bold">Importeer meldingen direct vanuit een spreadsheet.</DialogDescription>
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
                    <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center gap-4 bg-slate-50/50">
                        <FileSpreadsheet className="h-12 w-12 text-slate-300" />
                        <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="max-w-xs" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sleep uw Excel of CSV bestand hierheen</p>
                    </div>
                    {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                </div>
            ) : step === 2 ? (
                <div className="space-y-6">
                    <ScrollArea className="max-h-[300px] pr-4">
                        <div className="grid gap-4">
                            {issueFields.map(f => (
                                <div key={f.id} className="grid grid-cols-2 items-center gap-4 border-b border-slate-100 pb-2">
                                    <Label className="text-xs font-black uppercase text-slate-500">{f.label}</Label>
                                    <Select value={mapping[f.id]} onValueChange={v => setMapping(prev => ({...prev, [f.id]: v}))}>
                                        <SelectTrigger className="h-9 text-xs font-bold"><SelectValue placeholder="Koppel kolom..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="--ignore--">-- Overslaan --</SelectItem>
                                            {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            ) : (
                <div className="py-12 flex flex-col items-center gap-4">
                    <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="h-12 w-12 text-green-600" />
                    </div>
                    <p className="font-black uppercase text-xl">Import Voltooid!</p>
                    <p className="text-slate-500 font-medium text-center">De opdrachten zijn toegevoegd aan het portaal.</p>
                </div>
            )}
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50 rounded-b-3xl">
            {step === 2 && (
                <>
                    <Button variant="ghost" onClick={() => setStep(1)} className="font-bold">Terug</Button>
                    <Button onClick={handleImport} className="font-black uppercase tracking-tight px-8">Importeer {data.length} regels</Button>
                </>
            )}
            {step === 3 && <Button onClick={() => onOpenChange(false)} className="w-full font-black uppercase">Sluiten</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
