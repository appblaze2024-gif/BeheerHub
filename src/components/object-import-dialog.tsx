
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
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { useFirestore, useMemoFirebase, useDoc, setDocumentNonBlocking } from '@/firebase';
import { collection, doc, writeBatch, arrayUnion } from 'firebase/firestore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle, CheckCircle, Loader2, PlusCircle, Tag } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as shapefile from 'shapefile';

interface ObjectImportDialogProps {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const objectFields = [
    'id', 'latitude', 'longitude', 'locatieType', 'locatieSubType', 
    'kwaliteit', 'isActief', 'straatnaam', 'huisnummer', 
    'waarschuwing', 'vulgraad'
];

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

// Robust CSV parser
const parseCSV = (csv: string): { headers: string[], data: string[][] } => {
    const lines = csv.split(/[\r\n]+/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
        return { headers: [], data: [] };
    }

    const delimiter = lines[0].includes(';') ? ';' : ',';
    
    const parseLine = (line: string) => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    const headers = parseLine(lines[0]).map(h => h.replace(/"/g, ''));
    const data = lines.slice(1).map(parseLine);
    
    return { headers, data };
};

const parseXLSX = (arrayBuffer: ArrayBuffer): { headers: string[], data: string[][] } => {
  const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (json.length === 0) {
    return { headers: [], data: [] };
  }

  const headers = json[0].map(String);
  const data = json.slice(1).map(row => row.map(String));

  return { headers, data };
}

export function ObjectImportDialog({
  children,
  open,
  onOpenChange,
  onSuccess,
}: ObjectImportDialogProps) {
  const firestore = useFirestore();
  const [step, setStep] = React.useState(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [data, setData] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Category selection state
  const [selectedCategory, setSelectedCategory] = React.useState<string>('prullenbak');
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = React.useState(false);

  const filtersRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'object_filters') : null, [firestore]);
  const { data: filtersData } = useDoc<{ custom: string[] }>(filtersRef);
  const customFilters = filtersData?.custom || [];

  React.useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1);
        setFile(null);
        setHeaders([]);
        setData([]);
        setMapping({});
        setIsImporting(false);
        setImportProgress(0);
        setError(null);
        setSelectedCategory('prullenbak');
        setNewCategoryName('');
        setShowNewCategoryInput(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 300);
    }
  }, [open]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setFile(files[0]);
    setError(null);

    const shpFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.shp'));
    const dbfFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.dbf'));
    const xlsxFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.xlsx'));
    const csvFile = Array.from(files).find(f => f.name.toLowerCase().endsWith('.csv'));

    try {
        let parsedHeaders: string[] = [];
        let parsedData: any[][] = [];

        if (shpFile) {
            if (!dbfFile) {
                setError("Selecteer alstublieft zowel een .shp als een .dbf bestand voor shapefile import.");
                return;
            }
            const shpBuffer = await shpFile.arrayBuffer();
            const dbfBuffer = await dbfFile.arrayBuffer();
            const geojson = await shapefile.read(shpBuffer, dbfBuffer);

            if (geojson && Array.isArray(geojson.features) && geojson.features.length > 0) {
                const firstFeatureProps = geojson.features[0].properties || {};
                parsedHeaders = ['longitude', 'latitude', ...Object.keys(firstFeatureProps)];
                
                parsedData = geojson.features.map(feature => {
                    const props = feature.properties || {};
                    const coords = (feature.geometry as any)?.coordinates;
                    const row: any[] = [];
                    row.push(coords ? coords[0] : null);
                    row.push(coords ? coords[1] : null);
                    Object.keys(firstFeatureProps).forEach(header => {
                        row.push(props[header]);
                    });
                    return row;
                });
            } else {
                 setError("Shapefile is leeg of kon niet worden gelezen.");
                return;
            }

        } else if (xlsxFile) {
            const fileContent = await xlsxFile.arrayBuffer();
            const { headers, data } = parseXLSX(fileContent);
            parsedHeaders = headers;
            parsedData = data;
        } else if (csvFile) {
            const fileContent = await csvFile.text();
            const { headers, data } = parseCSV(fileContent);
            parsedHeaders = headers;
            parsedData = data;
        } else {
            setError("Selecteer een ondersteund bestandstype: .csv, .xlsx, of .shp + .dbf.");
            return;
        }

        if (parsedHeaders.length === 0) {
            setError("Kon geen headers of data vinden in het bestand.");
            return;
        }

        setHeaders(parsedHeaders);
        setData(parsedData.map(row => row.map(val => val !== null && val !== undefined ? String(val) : '')));

        const newMapping: Record<string, string> = {};
        objectFields.forEach(field => {
            const lowerField = field.toLowerCase().replace(/ /g, '');
            const foundHeader = parsedHeaders.find(header => {
                if (typeof header !== 'string') return false;
                const lowerHeader = header.toLowerCase().replace(/ /g, '');
                if (lowerHeader === lowerField) return true;
                if (lowerField === 'latitude' && (lowerHeader === 'lat' || lowerHeader === 'y' || lowerHeader === 'y-coordinaat' || lowerHeader === 'latitude')) return true;
                if (lowerField === 'longitude' && (lowerHeader === 'lon' || lowerHeader === 'long' || lowerHeader === 'x' || lowerHeader === 'x-coordinaat' || lowerHeader === 'longitude')) return true;
                return false;
            });
            if (foundHeader) {
                newMapping[field] = foundHeader;
            }
        });
        setMapping(newMapping);
        setStep(2);

    } catch (err) {
        console.error("Fout bij het parsen van bestand:", err);
        setError("Fout bij het verwerken van het bestand. Controleer het formaat.");
    }
  };

  const fetchAddress = async (longitude: number, latitude: number): Promise<{ street: string; houseNumber: string }> => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        return {
          street: feature.text || '',
          houseNumber: feature.address || '',
        };
      }
    } catch (error) {
      console.error('Error fetching address:', error);
    }
    return { street: '', houseNumber: '' };
  };

  const handleImport = async () => {
    if (!firestore || data.length === 0) {
        setError("Geen data om te importeren.");
        return;
    }
    
    if (!mapping['id']) {
        setError("Het veld 'id' moet worden gekoppeld om objecten te kunnen importeren.");
        return;
    }
    
    setIsImporting(true);
    setImportProgress(0);
    setError(null);

    // Determine final category
    let finalCategory = selectedCategory;
    if (showNewCategoryInput && newCategoryName.trim()) {
        finalCategory = newCategoryName.trim();
        // Save new category to filters
        if (filtersRef) {
            await setDocumentNonBlocking(filtersRef, {
                custom: arrayUnion(finalCategory)
            }, { merge: true });
        }
    }

    const headerIndexMap: Record<string, number> = {};
    headers.forEach((h, i) => { headerIndexMap[h] = i; });

    const fieldIndexMap: Record<string, number> = {};
    for(const field in mapping) {
        if(mapping[field] && mapping[field] !== '--ignore--') {
            fieldIndexMap[field] = headerIndexMap[mapping[field]];
        }
    }

    const objectsColRef = collection(firestore, 'objects');
    const batchSize = 100;

    try {
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = writeBatch(firestore);
        const chunk = data.slice(i, i + batchSize);

        for (const row of chunk) {
            const objectData: Record<string, any> = {
                locatieType: finalCategory
            };
            let originalId = row[fieldIndexMap['id']];

            if (!originalId || originalId.trim() === '') {
                originalId = "N.B";
            } else {
                originalId = originalId.trim();
            }

            for(const field in fieldIndexMap) {
                const index = fieldIndexMap[field];
                if (index === undefined || index >= row.length) continue;

                const value = row[index] ? row[index].trim() : undefined;

                if (value !== undefined) {
                    if(['latitude', 'longitude', 'vulgraad'].includes(field)) {
                        objectData[field] = parseFloat(value.replace(',', '.'));
                    } else if (field === 'isActief') {
                        objectData[field] = ['true', '1', 'ja', 'yes'].includes(value.toLowerCase());
                    } else {
                        objectData[field] = value;
                    }
                }
            }

            // Force selected category
            objectData.locatieType = finalCategory;

            if (!objectData.straatnaam && objectData.latitude && objectData.longitude) {
              const { street, houseNumber } = await fetchAddress(objectData.longitude, objectData.latitude);
              objectData.straatnaam = street;
              objectData.huisnummer = houseNumber;
            }

            if(originalId) {
                // Composite ID allows same original ID in different categories
                const firestoreId = `${finalCategory}_${originalId}`.replace(/\//g, '-'); 
                const docRef = doc(objectsColRef, firestoreId);
                // Store both the random Firestore ID (as id) and original ID (as idNummer)
                batch.set(docRef, { ...objectData, idNummer: originalId }, { merge: true });
            }
        }
        
        await batch.commit();
        setImportProgress(((i + chunk.length) / data.length) * 100);
      }
      
      setStep(3);
      onSuccess();

    } catch (error: any) {
      console.error("Error importing objects: ", error);
      setError(`Fout tijdens importeren: ${error.message}`);
    } finally {
        setIsImporting(false);
    }
  };

  const renderContent = () => {
      if (isImporting) {
        return (
             <div className='flex flex-col items-center justify-center gap-4 py-8'>
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
                <p className="font-black uppercase tracking-tight">Objecten importeren...</p>
                 <p className="text-xs text-muted-foreground font-bold">Dit kan even duren, omdat adresgegevens worden opgehaald.</p>
                <Progress value={importProgress} className="w-full" />
                <p className='text-sm text-muted-foreground font-black'>{Math.round(importProgress)}% voltooid</p>
            </div>
        )
      }
      switch(step) {
          case 1:
              return (
                <div className="py-8 space-y-4">
                    <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-4 bg-slate-50/50">
                        <Label htmlFor="csv-file" className="sr-only">Bestand</Label>
                        <Input
                            id="csv-file"
                            type="file"
                            accept=".csv,.xlsx,.xls,.dbf,.prj,.shp,.shx"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="w-full h-12 text-base"
                            multiple
                        />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">
                            Ondersteunt: .csv, .xlsx, of .shp + .dbf
                        </p>
                    </div>
                     {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}
                </div>
              );
          case 2:
              return (
                 <div className="space-y-6">
                    <div className="bg-slate-900 text-white p-6 rounded-3xl space-y-4 shadow-xl">
                        <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                            <Tag className="h-5 w-5 text-primary" />
                            <h3 className="text-sm font-black uppercase tracking-tight">Doelcategorie (Filter)</h3>
                        </div>
                        
                        <div className="space-y-3">
                            <Select 
                                value={showNewCategoryInput ? 'new' : selectedCategory} 
                                onValueChange={(v) => {
                                    if (v === 'new') {
                                        setShowNewCategoryInput(true);
                                    } else {
                                        setShowNewCategoryInput(false);
                                        setSelectedCategory(v);
                                    }
                                }}
                            >
                                <SelectTrigger className="h-11 font-black bg-white/10 border-none text-white focus:ring-primary/30">
                                    <SelectValue placeholder="Kies een categorie..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Standaard</SelectLabel>
                                        <SelectItem value="prullenbak">Prullenbakken</SelectItem>
                                        <SelectItem value="container">Ondergrondse containers</SelectItem>
                                    </SelectGroup>
                                    {customFilters.length > 0 && (
                                        <SelectGroup>
                                            <SelectLabel>Uw Filters</SelectLabel>
                                            {customFilters.map(cf => (
                                                <SelectItem key={cf} value={cf}>{cf}</SelectItem>
                                            ))}
                                        </SelectGroup>
                                    )}
                                    <SelectItem value="new" className="font-black uppercase text-primary tracking-tighter">
                                        <PlusCircle className="mr-2 h-4 w-4 inline" />
                                        Nieuwe categorie aanmaken
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {showNewCategoryInput && (
                                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Naam nieuwe categorie</Label>
                                    <Input 
                                        placeholder="Bv. Lichtmasten..." 
                                        value={newCategoryName} 
                                        onChange={e => setNewCategoryName(e.target.value)}
                                        className="h-11 bg-white/10 border-none text-white font-bold focus:ring-primary/30"
                                        autoFocus
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            Veld Mapping (Gevonden: {data.length} rijen)
                        </p>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        {objectFields.map((field) => (
                            <div key={field} className="grid grid-cols-2 items-center gap-4">
                            <Label htmlFor={`mapping-${field}`} className="capitalize text-right font-bold text-xs text-slate-600">
                                {field.replace('_', ' ')}
                            </Label>
                            <Select
                                value={mapping[field]}
                                onValueChange={(value) =>
                                setMapping((prev) => ({ ...prev, [field]: value }))
                                }
                            >
                                <SelectTrigger id={`mapping-${field}`} className="h-9 border-slate-200 font-medium text-[11px]">
                                <SelectValue placeholder="Selecteer een kolom" />
                                </SelectTrigger>
                                <SelectContent>
                                <SelectItem value="--ignore--">-- Negeer --</SelectItem>
                                {headers.map((header) => (
                                    <SelectItem key={header} value={header}>
                                    {header}
                                    </SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            </div>
                        ))}
                        </div>
                    </div>

                    <Alert variant={mapping['id'] ? "default" : "destructive"} className="rounded-2xl border-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle className="font-black uppercase tracking-tight text-xs">{mapping['id'] ? "Klaar om te importeren" : "Opgelet!"}</AlertTitle>
                        <AlertDescription className="text-[10px] font-bold">
                          {mapping['id'] ? `De objecten worden opgeslagen onder filter: ${showNewCategoryInput ? (newCategoryName || 'Nieuw') : selectedCategory}` : "Zorg ervoor dat de kolom voor 'id' is gekoppeld, dit wordt gebruikt als de unieke ID voor elk object."}
                        </AlertDescription>
                    </Alert>
                    {error && <p className="text-red-500 text-sm font-bold mt-2">{error}</p>}
                </div>
              );
          case 3:
              return (
                 <div className='flex flex-col items-center gap-4 py-12'>
                    <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                        <CheckCircle className="h-12 w-12 text-green-500" />
                    </div>
                    <p className='font-black uppercase tracking-tight text-xl'>Importeren voltooid!</p>
                    <p className='text-sm text-slate-500 font-medium text-center'>{data.length} objecten zijn succesvol toegevoegd aan de categorie.</p>
                </div>
              )
      }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
        <DialogHeader className="p-8 border-b bg-slate-50 shrink-0">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight">Objecten Importeren</DialogTitle>
          <DialogDescription className="font-bold text-slate-500">
            {step === 1 && 'Selecteer een CSV, XLSX of Shapefile om te importeren.'}
            {step === 2 && 'Koppel uw kolommen en kies de juiste doel-categorie.'}
            {step === 3 && 'De import is succesvol afgerond.'}
          </DialogDescription>
        </DialogHeader>

        <div className="p-8">
            {renderContent()}
        </div>

        <DialogFooter className="p-8 border-t bg-slate-50 shrink-0">
          {step === 1 && <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold">Annuleren</Button>}
          {step === 2 && !isImporting && (
            <>
              <Button variant="ghost" onClick={() => setStep(1)} className="font-bold">
                Terug
              </Button>
              <Button onClick={handleImport} disabled={!mapping['id'] || (showNewCategoryInput && !newCategoryName.trim())} className="h-12 px-12 font-black uppercase tracking-tight shadow-xl shadow-primary/20 rounded-xl">
                Importeer {data.length} Objecten
              </Button>
            </>
          )}
          {step === 3 && !isImporting && (
             <Button onClick={() => onOpenChange(false)} className="h-12 px-12 font-black uppercase tracking-tight shadow-xl shadow-primary/20 rounded-xl">
                Sluiten
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
