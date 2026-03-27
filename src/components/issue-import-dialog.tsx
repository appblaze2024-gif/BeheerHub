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
  DialogClose,
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
import { useFirestore, addDocumentNonBlocking, updateDocumentNonBlocking, useUser } from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, serverTimestamp, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle, Loader2, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface IssueImportDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const issueFields = [
    { id: 'intakenummer', label: 'Meldingsnummer', required: false },
    { id: 'extern_meldingsnummer', label: 'Extern Nummer', required: false },
    { id: 'containernummer', label: 'Containernummer', required: true },
    { id: 'hoofdcategorie', label: 'Hoofdcategorie', required: false },
    { id: 'subcategorie', label: 'Subcategorie / Fractie', required: true },
    { id: 'straatnaam', label: 'Straatnaam', required: false },
    { id: 'huisnummer', label: 'Huisnummer', required: false },
    { id: 'plaats', label: 'Plaats', required: false },
    { id: 'extra_informatie', label: 'Omschrijving / Memo', required: false },
    { id: 'melder', label: 'Naam Melder', required: false },
    { id: 'soort_melder', label: 'Soort Melder', required: false },
    { id: 'datum', label: 'Datum (JJJJ-MM-DD)', required: false },
    { id: 'tijdstip', label: 'Tijdstip (UU:MM)', required: false },
];

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

export function IssueImportDialog({
  children,
  open,
  onOpenChange,
  onSuccess,
}: IssueImportDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
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

            // Headers are expected on the first row (index 0)
            const fileHeaders = json[0].map(h => h !== null && h !== undefined ? String(h).trim() : '');
            
            // Data rows start from the second row (index 1 onwards)
            const fileData = json.slice(1)
                .map(row => row.map(val => val !== null && val !== undefined ? String(val).trim() : ''))
                .filter(row => row.some(cell => cell !== '')); // Skip rows where all cells are empty

            if (fileData.length === 0) {
                setError("Geen data gevonden onder de kopregel.");
                return;
            }

            setHeaders(fileHeaders);
            setData(fileData);

            // Auto-map logic based on header names
            const newMapping: Record<string, string> = {};
            issueFields.forEach(field => {
                const found = fileHeaders.find(h => 
                  h.toLowerCase().includes(field.id.toLowerCase()) || 
                  h.toLowerCase().includes(field.label.toLowerCase()) ||
                  (field.id === 'subcategorie' && h.toLowerCase().includes('fractie')) ||
                  (field.id === 'containernummer' && h.toLowerCase().includes('baknr'))
                );
                if (found) newMapping[field.id] = found;
            });
            setMapping(newMapping);
            setStep(2);
        } catch (err) {
            setError("Fout bij inlezen bestand. Controleer of het een geldig Excel of CSV bestand is.");
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

    const requiredFields = issueFields.filter(f => f.required).map(f => f.id);
    const missingMappings = requiredFields.filter(id => !mapping[id] || mapping[id] === '--ignore--');
    
    if (missingMappings.length > 0) {
        const labels = missingMappings.map(id => issueFields.find(f => f.id === id)?.label).join(', ');
        setError(`Niet alle verplichte velden zijn gekoppeld: ${labels}`);
        return;
    }

    setIsImporting(true);
    
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => { if(h) headerMap[h] = i; });

    try {
        const optionsRef = doc(firestore, 'settings', 'issue_options');
        const optionsSnap = await getDoc(optionsRef);
        const currentOptions = optionsSnap.exists() ? optionsSnap.data() : { hoofdcategorieen: [], subcategorieen: {} };
        const subcategorieen = currentOptions.subcategorieen || {};
        let optionsChanged = false;

        const creatorName = profile?.displayName || profile?.email || user?.email || 'Import Systeem';
        const timestamp = format(new Date(), 'yyyyMMdd');

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const issueData: any = {
                status: 'Nieuw',
                aangenomen_door: creatorName,
                soort_melder: 'Inwoner', 
                datum: format(new Date(), 'yyyy-MM-dd'),
                tijdstip: format(new Date(), 'HH:mm'),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };

            issueFields.forEach(f => {
                const colName = mapping[f.id];
                if (colName && headerMap[colName] !== undefined) {
                    const value = row[headerMap[colName]];
                    if (value) issueData[f.id] = value;
                }
            });

            // Generation of unique intakenummer if missing
            if (!issueData.intakenummer) {
                issueData.intakenummer = `IMP-${timestamp}-${i + 1}`;
            }

            // Lookup address data from containernummer
            if (issueData.containernummer) {
                const q = query(
                    collection(firestore, 'objects'),
                    where('idNummer', '==', issueData.containernummer.toUpperCase()),
                    limit(1)
                );
                const objSnap = await getDocs(q);
                if (!objSnap.empty) {
                    const objData = objSnap.docs[0].data();
                    // Override with data from DB if row data is missing
                    if (!issueData.straatnaam) issueData.straatnaam = objData.straatnaam || '';
                    if (!issueData.huisnummer) issueData.huisnummer = objData.huisnummer || '';
                    if (!issueData.plaats) issueData.plaats = objData.plaats || '';
                    if (!issueData.postcode) issueData.postcode = objData.postcode || '';
                    if (!issueData.werkgebied) issueData.werkgebied = objData.wijk || (objData.locatieWerkgebieden?.[0] || '');
                    
                    issueData.latitude = objData.latitude || 0;
                    issueData.longitude = objData.longitude || 0;
                }
            }

            // Automatic Subtype (Fractie) registration
            const hc = issueData.hoofdcategorie || 'Afval'; 
            const sc = issueData.subcategorie;
            
            if (sc && hc) {
                if (!subcategorieen[hc]) subcategorieen[hc] = [];
                if (!subcategorieen[hc].includes(sc)) {
                    subcategorieen[hc].push(sc);
                    optionsChanged = true;
                }
            }

            // Geocode if location is still missing
            if (!issueData.latitude || !issueData.longitude) {
                const address = `${issueData.straatnaam || ''} ${issueData.huisnummer || ''}, ${issueData.plaats || ''}`.trim();
                if (address.length > 5) {
                    const coords = await geocode(address);
                    issueData.latitude = coords.lat;
                    issueData.longitude = coords.lng;
                } else {
                    issueData.latitude = 0;
                    issueData.longitude = 0;
                }
            }

            await addDocumentNonBlocking(collection(firestore, 'meldingen'), issueData);
            setImportProgress(((i + 1) / data.length) * 100);
        }

        if (optionsChanged) {
            updateDocumentNonBlocking(optionsRef, { subcategorieen });
        }

        setStep(3);
        onSuccess();
    } catch (err) {
        console.error("Import error:", err);
        setError("Er is een fout opgetreden tijdens het importeren van de meldingen.");
    } finally {
        setIsImporting(false);
    }
  };

  const isMappingValid = () => {
    return !issueFields
        .filter(f => f.required)
        .some(f => !mapping[f.id] || mapping[f.id] === '--ignore--');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-none border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-slate-900 text-white rounded-none">
          <DialogTitle className="text-xl font-black uppercase tracking-tight">CSV / EXCEL Import</DialogTitle>
          <DialogDescription className="text-slate-400 font-bold">Importeer meldingen vanaf de kopregel (regel 2 onwards).</DialogDescription>
        </DialogHeader>

        <div className="p-6">
            {isImporting ? (
                <div className="py-12 flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="font-black uppercase text-sm">Meldingen verwerken...</p>
                    <Progress value={importProgress} className="w-full h-2 rounded-none" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{Math.round(importProgress)}%</p>
                </div>
            ) : step === 1 ? (
                <div className="py-8 space-y-4">
                    <div className="p-12 border-2 border-dashed border-slate-200 rounded-none flex flex-col items-center gap-4 bg-slate-50/50">
                        <FileSpreadsheet className="h-12 w-12 text-slate-300" />
                        <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="max-w-xs" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Data wordt vanaf regel 2 ingelezen</p>
                    </div>
                    {error && <Alert variant="destructive" className="rounded-none"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs font-bold">{error}</AlertDescription></Alert>}
                </div>
            ) : step === 2 ? (
                <div className="space-y-6">
                    <ScrollArea className="max-h-[350px] pr-4">
                        <div className="grid gap-4">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Koppel kolommen (* = verplicht)</p>
                            {issueFields.map(f => (
                                <div key={f.id} className="grid grid-cols-2 items-center gap-4 border-b border-slate-100 pb-2">
                                    <Label className={cn(
                                        "text-xs font-black uppercase",
                                        f.required ? "text-slate-900" : "text-slate-400"
                                    )}>
                                        {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                                    </Label>
                                    <Select value={mapping[f.id]} onValueChange={v => setMapping(prev => ({...prev, [f.id]: v}))}>
                                        <SelectTrigger className={cn(
                                            "h-9 text-xs font-bold rounded-none",
                                            f.required && (!mapping[f.id] || mapping[f.id] === '--ignore--') ? "border-red-200 bg-red-50/30" : "border-slate-200"
                                        )}>
                                            <SelectValue placeholder="Koppel kolom..." />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-none">
                                            <SelectItem value="--ignore--" className="rounded-none text-slate-400 italic">-- Overslaan --</SelectItem>
                                            {headers.filter(h => !!h).map((h, idx) => <SelectItem key={`${h}-${idx}`} value={h} className="rounded-none">{h}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    {error && <Alert variant="destructive" className="rounded-none"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs font-bold">{error}</AlertDescription></Alert>}
                    {!error && (
                        <Alert className="rounded-none border-primary/20 bg-primary/5">
                            <CheckCircle className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-xs font-black uppercase">Start vanaf regel 2</AlertTitle>
                            <AlertDescription className="text-[10px] font-bold text-slate-500">
                                Het systeem herkent {data.length} meldingen onder de kopregel.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            ) : (
                <div className="py-12 flex flex-col items-center gap-4">
                    <div className="h-20 w-20 rounded-none bg-green-100 flex items-center justify-center">
                        <CheckCircle className="h-12 w-12 text-green-600" />
                    </div>
                    <p className="font-black uppercase text-xl">Import Voltooid!</p>
                    <p className="text-slate-500 font-medium text-center">{data.length} meldingen succesvol verwerkt.</p>
                </div>
            )}
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50 rounded-none">
            {step === 2 && (
                <>
                    <Button variant="ghost" onClick={() => setStep(1)} className="font-bold rounded-none">Terug</Button>
                    <Button onClick={handleImport} disabled={!isMappingValid() || isImporting} className="font-black uppercase tracking-tight px-8 rounded-none shadow-xl shadow-primary/20">
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Importeer {data.length} regels
                    </Button>
                </>
            )}
            {step === 3 && <Button onClick={() => onOpenChange(false)} className="w-full font-black uppercase rounded-none">Sluiten</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
