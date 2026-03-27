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
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { 
  useFirestore, 
  addDocumentNonBlocking, 
  updateDocumentNonBlocking, 
  useUser, 
  setDocumentNonBlocking,
  useDoc,
  useMemoFirebase
} from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { collection, serverTimestamp, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle, Loader2, FileSpreadsheet, Sparkles, Palette, Search as SearchIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import * as XLSX from 'xlsx';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useToast } from '@/components/ui/use-toast';

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

const PRESET_COLORS = [
  { name: 'Primair', value: '#3b82f6' },
  { name: 'Rood', value: '#ef4444' },
  { name: 'Groen', value: '#22c55e' },
  { name: 'Oranje', value: '#f97316' },
  { name: 'Paars', value: '#a855f7' },
  { name: 'Geel', value: '#eab308' },
  { name: 'Grijs', value: '#64748b' },
  { name: 'Zwart', value: '#0f172a' },
];

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

interface NewCategoryConfig {
    subcategory: string;
    parentCategory: string;
    icon: string;
    color: string;
}

export function IssueImportDialog({
  children,
  open,
  onOpenChange,
  onSuccess,
}: IssueImportDialogProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [step, setStep] = React.useState(1);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [data, setData] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [newCategoriesToConfig, setNewCategoriesToConfig] = React.useState<NewCategoryConfig[]>([]);
  const [iconSearch, setIconSearch] = React.useState('');

  const optionsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'issue_options') : null, [firestore]);
  const { data: dbOptions } = useDoc<any>(optionsRef);

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
        setNewCategoriesToConfig([]);
      }, 300);
    }
  }, [open]);

  const filteredIcons = React.useMemo(() => {
    const all = Object.keys(Icons).filter(name => typeof (Icons as any)[name] === 'function' || typeof (Icons as any)[name] === 'object');
    if (!iconSearch.trim()) return all.slice(0, 100);
    const q = iconSearch.toLowerCase();
    return all.filter(name => name.toLowerCase().includes(q)).slice(0, 100);
  }, [iconSearch]);

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

            const fileHeaders = json[0].map(h => h !== null && h !== undefined ? String(h).trim() : '');
            const fileData = json.slice(1)
                .map(row => row.map(val => val !== null && val !== undefined ? String(val).trim() : ''))
                .filter(row => row.some(cell => cell !== ''));

            if (fileData.length === 0) {
                setError("Geen data gevonden onder de kopregel.");
                return;
            }

            setHeaders(fileHeaders);
            setData(fileData);

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

  const handleStartImportAnalysis = async () => {
    if (!firestore || data.length === 0 || !dbOptions) return;

    const requiredFields = issueFields.filter(f => f.required).map(f => f.id);
    const missingMappings = requiredFields.filter(id => !mapping[id] || mapping[id] === '--ignore--');
    
    if (missingMappings.length > 0) {
        const labels = missingMappings.map(id => issueFields.find(f => f.id === id)?.label).join(', ');
        setError(`Niet alle verplichte velden zijn gekoppeld: ${labels}`);
        return;
    }

    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => { if(h) headerMap[h] = i; });

    const existingSubtypes = dbOptions.subcategorieen || {};
    const newFound: NewCategoryConfig[] = [];

    data.forEach(row => {
        const scCol = mapping['subcategorie'];
        const hcCol = mapping['hoofdcategorie'];
        
        const sc = row[headerMap[scCol]];
        const hc = hcCol ? row[headerMap[hcCol]] : 'Afval';

        if (sc && hc) {
            const alreadyInConfig = existingSubtypes[hc]?.includes(sc);
            const alreadyInNew = newFound.some(nf => nf.subcategory === sc && nf.parentCategory === hc);
            
            if (!alreadyInConfig && !alreadyInNew) {
                newFound.push({
                    subcategory: sc,
                    parentCategory: hc,
                    icon: 'lucide:AlertCircle:#3b82f6',
                    color: '#3b82f6'
                });
            }
        }
    });

    if (newFound.length > 0) {
        setNewCategoriesToConfig(newFound);
        setStep(3);
    } else {
        executeImport();
    }
  };

  const executeImport = async () => {
    if (!firestore || data.length === 0) return;
    setIsImporting(true);
    setStep(4);
    
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => { if(h) headerMap[h] = i; });

    try {
        const optionsRef = doc(firestore, 'settings', 'issue_options');
        const optionsSnap = await getDoc(optionsRef);
        const currentOptions = optionsSnap.exists() ? optionsSnap.data() : { hoofdcategorieen: [], subcategorieen: {}, subtypeIcons: {} };
        
        const subcategorieen = { ...(currentOptions.subcategorieen || {}) };
        const subtypeIcons = { ...(currentOptions.subtypeIcons || {}) };
        let optionsChanged = false;

        // Apply new category configs
        newCategoriesToConfig.forEach(cfg => {
            if (!subcategorieen[cfg.parentCategory]) subcategorieen[cfg.parentCategory] = [];
            if (!subcategorieen[cfg.parentCategory].includes(cfg.subcategory)) {
                subcategorieen[cfg.parentCategory].push(cfg.subcategory);
                subtypeIcons[`${cfg.parentCategory}:${cfg.subcategory}`] = cfg.icon;
                optionsChanged = true;
            }
        });

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

            if (!issueData.intakenummer) {
                issueData.intakenummer = `IMP-${timestamp}-${i + 1}`;
            }

            if (issueData.containernummer) {
                const q = query(
                    collection(firestore, 'objects'),
                    where('idNummer', '==', issueData.containernummer.toUpperCase()),
                    limit(1)
                );
                const objSnap = await getDocs(q);
                if (!objSnap.empty) {
                    const objData = objSnap.docs[0].data();
                    if (!issueData.straatnaam) issueData.straatnaam = objData.straatnaam || '';
                    if (!issueData.huisnummer) issueData.huisnummer = objData.huisnummer || '';
                    if (!issueData.plaats) issueData.plaats = objData.plaats || '';
                    if (!issueData.postcode) issueData.postcode = objData.postcode || '';
                    if (!issueData.werkgebied) issueData.werkgebied = objData.wijk || (objData.locatieWerkgebieden?.[0] || '');
                    issueData.latitude = objData.latitude || 0;
                    issueData.longitude = objData.longitude || 0;
                }
            }

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
            updateDocumentNonBlocking(optionsRef, { subcategorieen, subtypeIcons });
        }

        setStep(5);
        onSuccess();
    } catch (err) {
        console.error("Import error:", err);
        setError("Er is een fout opgetreden tijdens de import.");
    } finally {
        setIsImporting(false);
    }
  };

  const updateConfigIcon = (index: number, iconName: string, color: string) => {
      setNewCategoriesToConfig(prev => {
          const next = [...prev];
          next[index] = { ...next[index], icon: `lucide:${iconName}:${color}`, color: color };
          return next;
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[650px] h-[80vh] rounded-none border-none shadow-2xl p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 bg-slate-900 text-white rounded-none shrink-0">
          <DialogTitle className="text-xl font-black uppercase tracking-tight">CSV / EXCEL Import</DialogTitle>
          <DialogDescription className="text-slate-400 font-bold">Importeer meldingen vanaf de kopregel (regel 2 onwards).</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white">
            {step === 1 && (
                <div className="py-8 space-y-4">
                    <div className="p-12 border-2 border-dashed border-slate-200 rounded-none flex flex-col items-center gap-4 bg-slate-50/50">
                        <FileSpreadsheet className="h-12 w-12 text-slate-300" />
                        <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="max-w-xs" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Data wordt vanaf regel 2 ingelezen</p>
                    </div>
                    {error && <Alert variant="destructive" className="rounded-none"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs font-bold">{error}</AlertDescription></Alert>}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-6">
                    <div className="grid gap-4">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-1">Koppel kolommen (* = verplicht)</p>
                        {issueFields.map(f => (
                            <div key={f.id} className="grid grid-cols-2 items-center gap-4 border-b border-slate-100 pb-2">
                                <Label className={cn("text-xs font-black uppercase", f.required ? "text-slate-900" : "text-slate-400")}>
                                    {f.label}{f.required && <span className="text-red-500 ml-1">*</span>}
                                </Label>
                                <Select value={mapping[f.id]} onValueChange={v => setMapping(prev => ({...prev, [f.id]: v}))}>
                                    <SelectTrigger className={cn("h-9 text-xs font-bold rounded-none", f.required && (!mapping[f.id] || mapping[f.id] === '--ignore--') ? "border-red-200 bg-red-50/30" : "border-slate-200")}>
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
                    {error && <Alert variant="destructive" className="rounded-none"><AlertCircle className="h-4 w-4" /><AlertDescription className="text-xs font-bold">{error}</AlertDescription></Alert>}
                </div>
            )}

            {step === 3 && (
                <div className="space-y-6">
                    <div className="space-y-1">
                        <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">Nieuwe Fracties Gevonden</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase italic">Stel hier direct de iconen in voor de nieuwe subcategorieën.</p>
                    </div>
                    <div className="grid gap-3">
                        {newCategoriesToConfig.map((cfg, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 border-2 border-slate-100 rounded-none shadow-sm">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{cfg.parentCategory}</p>
                                    <p className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{cfg.subcategory}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="h-12 w-12 p-0 rounded-none border-2 border-primary/20 shadow-sm flex items-center justify-center bg-white overflow-hidden group">
                                                {(() => {
                                                    const parts = cfg.icon.split(':');
                                                    const IconComp = (Icons as any)[parts[1] || 'AlertCircle'] || Icons.AlertCircle;
                                                    return <IconComp className="h-6 w-6" style={{ color: parts[2] || '#3b82f6' }} />;
                                                })()}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 p-0 rounded-none border-none shadow-2xl bg-white overflow-hidden">
                                            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-widest">Kies Icoon & Kleur</span>
                                            </div>
                                            <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {PRESET_COLORS.map(c => (
                                                        <button 
                                                            key={c.value} 
                                                            type="button"
                                                            className={cn("h-6 w-6 rounded-none border-2 transition-all", cfg.color === c.value ? "border-primary scale-110 shadow-md" : "border-transparent")}
                                                            style={{ backgroundColor: c.value }}
                                                            onClick={() => updateConfigIcon(idx, cfg.icon.split(':')[1], c.value)}
                                                        />
                                                    ))}
                                                </div>
                                                <div className="relative">
                                                    <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                                    <Input placeholder="Zoek..." className="h-8 pl-8 text-[10px] font-bold rounded-none border-slate-200" value={iconSearch} onChange={e => setIconSearch(e.target.value)} />
                                                </div>
                                                <div className="grid grid-cols-6 gap-2">
                                                    {filteredIcons.map(name => {
                                                        const Icon = (Icons as any)[name];
                                                        const isSelected = cfg.icon.split(':')[1] === name;
                                                        return (
                                                            <Button 
                                                                key={name} 
                                                                variant={isSelected ? "default" : "outline"}
                                                                size="icon" 
                                                                className="h-8 w-8 p-0 rounded-none shrink-0" 
                                                                onClick={() => updateConfigIcon(idx, name, cfg.color)}
                                                            >
                                                                <Icon className="h-4 w-4" style={{ color: isSelected ? undefined : cfg.color }} />
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="py-12 flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="font-black uppercase text-sm">Meldingen verwerken...</p>
                    <Progress value={importProgress} className="w-full h-2 rounded-none" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{Math.round(importProgress)}%</p>
                </div>
            )}

            {step === 5 && (
                <div className="py-12 flex flex-col items-center gap-4">
                    <div className="h-20 w-20 rounded-none bg-green-100 flex items-center justify-center mb-4">
                        <CheckCircle className="h-12 w-12 text-green-600" />
                    </div>
                    <p className="font-black uppercase text-xl">Import Voltooid!</p>
                    <p className="text-slate-500 font-medium text-center">{data.length} meldingen succesvol verwerkt.</p>
                </div>
            )}
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50 rounded-none shrink-0">
            {step === 2 && (
                <>
                    <Button variant="ghost" onClick={() => setStep(1)} className="font-bold rounded-none">Terug</Button>
                    <Button onClick={handleStartImportAnalysis} className="font-black uppercase tracking-tight px-8 rounded-none shadow-xl shadow-primary/20 h-11">
                        Verder naar analyse
                    </Button>
                </>
            )}
            {step === 3 && (
                <>
                    <Button variant="ghost" onClick={() => setStep(2)} className="font-bold rounded-none">Terug</Button>
                    <Button onClick={executeImport} className="font-black uppercase tracking-tight px-8 rounded-none shadow-xl shadow-primary/20 h-11 bg-primary text-white">
                        Import Starten
                    </Button>
                </>
            )}
            {step === 5 && <Button onClick={() => onOpenChange(false)} className="w-full font-black uppercase rounded-none h-11">Sluiten</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
