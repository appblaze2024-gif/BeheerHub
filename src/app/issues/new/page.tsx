'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { 
  Loader2, 
  UploadCloud, 
  Trash2, 
  Camera, 
  MapPin, 
  Sparkles, 
  X, 
  Check,
  Paperclip,
  FileSpreadsheet,
  ClipboardPaste,
  ChevronRight,
  Plus,
  MoreHorizontal,
  LayoutGrid,
  File as FileIcon,
  ImageIcon,
  PlusCircle,
  Settings2,
  Trash,
  Code,
  Upload,
  Edit2,
  CircleHelp,
  AlertCircle,
  Palette,
  Search as SearchIcon
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { 
  useFirestore, 
  addDocumentNonBlocking, 
  useFirebaseApp, 
  useDoc, 
  useMemoFirebase,
  updateDocumentNonBlocking,
  useCollection,
  setDocumentNonBlocking
} from '@/firebase';
import { useProfile } from '@/firebase/profile-provider';
import { useGlobalLoading } from '@/context/global-loading-context';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useIsMobile } from '@/hooks/use-mobile';

// UI Components
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import * as turf from '@turf/turf';

// Custom components
import { IssueImportDialog } from '@/components/issue-import-dialog';
import { MapboxView } from '@/components/mapbox-view';
import type { Melding, Object as MapObject, UploadedFile, Project } from '@/lib/types';

// AI Flows
import { parseIssuePdf } from '@/ai/flows/parse-issue-pdf-flow';

const MAPBOX_TOKEN = 'pk.eyJ1IjoiZGphbmcwbzAiLCJhIjoiY21kNG5zZDJhMGN2djJscXBvNGtzcWRrdCJ9.e371yZYDeXyMnWKUWQcqAg';

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

const newMeldingSchema = z.object({
  intakenummer: z.string().min(1, 'Meldingsnummer is verplicht'),
  extern_meldingsnummer: z.string().optional().nullable(),
  containernummer: z.string().optional().nullable(),
  soort_melder: z.string().min(1, 'Soort melder is verplicht'),
  hoofdcategorie: z.string().min(1, 'Hoofdtype is verplicht'),
  subcategorie: z.string().min(1, 'Subtype is verplicht'),
  behandelende_afdeling: z.string().optional().nullable(),
  behandelaar: z.string().optional().nullable(),
  aangenomen_door: z.string().min(1, 'Naam is verplicht'),
  status: z.string().default('Nieuw'),
  voorvaldatum: z.any().optional().nullable(),
  voorvaltijd: z.string().optional().nullable(),
  meldingsdatum: z.any().optional().nullable(),
  meldingsuur: z.string().min(1, 'Tijdstip is verplicht'),
  straatnaam: z.string().min(1, 'Straatnaam is verplicht'),
  huisnummer: z.string().min(1, 'Huisnummer is verplicht'),
  postcode: z.string().optional().nullable(),
  plaats: z.string().optional().nullable(),
  wijk: z.string().optional().nullable(),
  werkgebied: z.string().optional().nullable(),
  melder: z.string().optional().nullable(),
  telefoon_melder: z.string().optional().nullable(),
  email_melder: z.string().optional().or(z.literal('')).nullable(),
  burgerservicenummer: z.string().optional().nullable(),
  extra_informatie: z.string().optional().nullable(),
});

type NewMeldingFormValues = z.infer<typeof newMeldingSchema>;

const DEFAULT_STATUS_OPTIONS = [
    "Nieuw", "Intern doorgezet", "In behandeling", "Gepland op korte termijn",
    "Gepland op langere termijn", "Dubbel gemeld", "Afgerond", "Niet in beheer", "Extern doorgezet", "Geweigerd"
];

const DEFAULT_HOOFDCATEGORIE_OPTIONS = ["Afval", "Weg en straatmeubilair", "Groen", "Water", "Overig", "Zoutkisten", "Ondergrondse container rest"];

const DEFAULT_SUBCATEGORIE_MAPPING: Record<string, string[]> = {
    "Afval": ["Volle of kapotte afvalbak", "Zwerfafval", "Dumping", "Dierenkadaver"],
    "Weg en straatmeubilair": ["Losse tegel(s)", "Gat in de weg", "Kapotte bank/paal/hek"],
    "Groen": ["Overhangende takken", "Onkruid", "Maaien"],
    "Water": ["Wateroverlast", "Verstopte put"],
    "Zoutkisten": ["Zoutkist leeg"],
    "Ondergrondse container rest": ["Container vol", "Container storing", "Container kapot"],
    "Overig": ["Overige meldingen"]
};

const DEFAULT_MELDER_TYPES = ["Inwoner", "Bedrijf", "Gemeente", "Toezichthouder"];

const FormRow = ({ label, children, onAdd }: { label: React.ReactNode; children: React.ReactNode; onAdd?: () => void }) => (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0 min-h-[44px]">
        <div className="flex items-center justify-between">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{label}</Label>
            {onAdd && (
                <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 text-slate-300 hover:text-primary transition-colors" 
                    onClick={onAdd}
                >
                    <PlusCircle className="h-4 w-4" />
                </Button>
            )}
        </div>
        <div className="flex-1 min-w-0">
            {children}
        </div>
    </div>
);

function SmartPasteDialog({ onParsed, instructions, trigger }: { onParsed: (data: any) => void, instructions: string, trigger?: React.ReactNode }) {
    const [text, setText] = React.useState('');
    const [isProcessing, setIsProcessing] = React.useState(false);
    const { toast } = useToast();

    const handlePaste = async () => {
        if (!text.trim()) return;
        setIsProcessing(true);
        try {
            const result = await parseIssuePdf({ textContent: text, instructions });
            if (result.meldingen && result.meldingen.length > 0) {
                onParsed(result.meldingen[0]);
                toast({ title: "Tekst geanalyseerd", description: "Velden zijn automatisch ingevuld." });
            }
        } catch (err) {
            toast({ variant: 'destructive', title: "Fout bij inlezen", description: "AI kon de tekst niet verwerken." });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold">
                        <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
                        Smart Paste
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="font-black uppercase tracking-tight">AI Smart Paste</DialogTitle>
                    <DialogDescription className="font-bold text-slate-500">Plak tekst uit een ander systeem om velden automatisch in te vullen.</DialogDescription>
                </DialogHeader>
                <div className="py-4"><Textarea placeholder="Plak hier de tekst..." className="min-h-[200px] text-xs font-medium" value={text} onChange={(e) => setText(e.target.value)} /></div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Annuleren</Button></DialogClose>
                    <Button onClick={handlePaste} disabled={isProcessing || !text.trim()} className="font-black uppercase">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Verwerken
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ManageHoofdtypeDialog({ open, onOpenChange, currentOptions, categoryIcons }: { 
  open: boolean, 
  onOpenChange: (open: boolean) => void, 
  currentOptions: string[],
  categoryIcons: Record<string, string>
}) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { toast } = useToast();
  const [newName, setNewName] = React.useState('');
  const [selectedIconName, setSelectedIconName] = React.useState('AlertCircle');
  const [selectedColor, setSelectedColor] = React.useState('#3b82f6');
  const [iconSearch, setIconSearch] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('preset');
  const [htmlIcon, setHtmlIcon] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<string | null>(null);

  const isSvg = (str: string) => {
    if (!str) return false;
    const trimmed = str.trim().toLowerCase();
    return trimmed.startsWith('<svg') || trimmed.includes('<svg') || trimmed.includes('xmlns="http://www.w3.org/2000/svg"');
  };

  const filteredIcons = React.useMemo(() => {
    const all = Object.keys(Icons).filter(name => typeof (Icons as any)[name] === 'function' || typeof (Icons as any)[name] === 'object');
    if (!iconSearch.trim()) return all.slice(0, 100);
    const q = iconSearch.toLowerCase();
    return all.filter(name => name.toLowerCase().includes(q)).slice(0, 100);
  }, [iconSearch]);

  React.useEffect(() => {
    if (editTarget) {
        const currentIcon = categoryIcons[editTarget] || 'AlertCircle';
        if (isSvg(currentIcon)) {
            setActiveTab('html');
            setHtmlIcon(currentIcon);
        } else if (currentIcon.startsWith('http')) {
            setActiveTab('upload');
            // Extract the URL? selectedIcon stores the full value
        } else if (currentIcon.startsWith('lucide:')) {
            setActiveTab('preset');
            const [_, name, color] = currentIcon.split(':');
            setSelectedIconName(name || 'AlertCircle');
            setSelectedColor(color || '#3b82f6');
        } else {
            setActiveTab('preset');
            setSelectedIconName(currentIcon);
            setSelectedColor('#3b82f6');
        }
    }
  }, [editTarget, categoryIcons]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !app) return;
    setIsUploading(true);
    const storage = getStorage(app);
    const path = `settings/icons/${Date.now()}_${file.name}`;
    try {
        const snapshot = await uploadBytesResumable(ref(storage, path), file);
        const url = await getDownloadURL(snapshot.ref);
        // Special marker for uploaded images
        // We set this as the icon value temporarily
        setHtmlIcon(url); // Reusing state for the URL
        toast({ title: "Icoon geüpload" });
    } catch (err: any) {
        console.error("Icon upload error:", err);
        toast({ variant: 'destructive', title: "Upload mislukt", description: err.message || "Onbekende fout." });
    } finally {
        setIsUploading(false);
    }
  };

  const handleSave = async () => {
    const target = editTarget || newName.trim();
    if (!target || !firestore) return;
    setIsSaving(true);
    try {
      let finalIcon = '';
      if (activeTab === 'html') {
          finalIcon = htmlIcon.trim();
      } else if (activeTab === 'upload') {
          finalIcon = htmlIcon; // Contains the URL
      } else {
          finalIcon = `lucide:${selectedIconName}:${selectedColor}`;
      }

      const updatedOptions = editTarget ? currentOptions : Array.from(new Set([...currentOptions, target]));
      const updatedIcons = { ...categoryIcons, [target]: finalIcon };
      
      await setDocumentNonBlocking(doc(firestore, 'settings', 'issue_options'), {
        hoofdcategorieen: updatedOptions,
        categoryIcons: updatedIcons
      }, { merge: true });
      
      toast({ title: editTarget ? 'Icoon bijgewerkt' : 'Hoofdtype toegevoegd' });
      setNewName('');
      setHtmlIcon('');
      setEditTarget(null);
      if (!editTarget) onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Fout bij opslaan' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!firestore) return;
    try {
      const updatedOptions = currentOptions.filter(o => o !== name);
      const newIcons = { ...categoryIcons };
      delete newIcons[name];

      await setDocumentNonBlocking(doc(firestore, 'settings', 'issue_options'), {
        hoofdcategorieen: updatedOptions,
        categoryIcons: newIcons
      }, { merge: true });
      
      toast({ title: 'Hoofdtype verwijderd' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Fout bij verwijderen' });
    }
  };

  const renderCurrentIcon = (val: string, isPreview = false) => {
    if (!val) return <CircleHelp className="h-4 w-4 text-slate-300" />;
    
    if (isSvg(val)) {
        return (
            <div 
                className={cn("flex items-center justify-center [&>svg]:h-full [&>svg]:w-full", isPreview ? "h-12 w-12 text-primary" : "h-4 w-4 text-primary")} 
                dangerouslySetInnerHTML={{ __html: val }} 
            />
        );
    }
    
    if (val.startsWith('http')) {
        return (
            <div className={cn("relative flex items-center justify-center", isPreview ? "h-12 w-12" : "h-4 w-4")}>
                <img src={val} alt="icon" className="h-full w-full object-contain" />
            </div>
        );
    }

    if (val.startsWith('lucide:')) {
        const [_, name, color] = val.split(':');
        const IconComp = (Icons as any)[name || 'AlertCircle'] || Icons.AlertCircle;
        return <IconComp className={cn(isPreview ? "h-12 w-12" : "h-4 w-4")} style={{ color: color || '#3b82f6' }} />;
    }

    const Icon = (Icons as any)[val] || Icons.CircleHelp;
    return <Icon className={cn(isPreview ? "h-12 w-12" : "h-4 w-4")} style={{ color: '#3b82f6' }} />;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if(!o) setEditTarget(null); }}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b bg-slate-50">
          <DialogTitle className="font-black uppercase">{editTarget ? `Icoon wijzigen: ${editTarget}` : 'Hoofdtypes Beheren'}</DialogTitle>
          <DialogDescription>Voeg types toe en koppel een eigen icoon, afbeelding of SVG.</DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="space-y-8 p-6">
            {!editTarget && (
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">Naam nieuw hoofdtype</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Bv. Verlichting..." className="font-bold h-11" />
              </div>
            )}

            <div className="space-y-6 bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 shadow-inner">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase text-slate-400">Configureer Icoon</Label>
                <div className="h-16 w-16 bg-white rounded-2xl border-2 border-primary/10 flex items-center justify-center shadow-lg">
                    {activeTab === 'preset' ? (
                        <div style={{ color: selectedColor }}>
                            {renderCurrentIcon(`lucide:${selectedIconName}:${selectedColor}`, true)}
                        </div>
                    ) : activeTab === 'upload' ? (
                        renderCurrentIcon(htmlIcon, true)
                    ) : (
                        renderCurrentIcon(htmlIcon, true)
                    )}
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid grid-cols-3 h-11 rounded-xl bg-slate-200 p-1 mb-6">
                      <TabsTrigger value="preset" className="text-[10px] font-black uppercase">Standaard</TabsTrigger>
                      <TabsTrigger value="upload" className="text-[10px] font-black uppercase">Upload</TabsTrigger>
                      <TabsTrigger value="html" className="text-[10px] font-black uppercase">HTML/SVG</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preset" className="space-y-6 mt-0">
                      <div className="space-y-3">
                          <Label className="text-[10px] font-black uppercase text-slate-400">Kies Kleur</Label>
                          <div className="flex flex-wrap gap-2">
                              {PRESET_COLORS.map(c => (
                                  <button
                                      key={c.value}
                                      type="button"
                                      className={cn(
                                          "h-8 w-8 rounded-full border-2 transition-all",
                                          selectedColor === c.value ? "border-slate-900 scale-110 shadow-md" : "border-transparent"
                                      )}
                                      style={{ backgroundColor: c.value }}
                                      onClick={() => setSelectedColor(c.value)}
                                      title={c.name}
                                  />
                              ))}
                              <div className="relative h-8 w-8 rounded-full overflow-hidden border-2 border-slate-200">
                                  <input 
                                      type="color" 
                                      value={selectedColor} 
                                      onChange={e => setSelectedColor(e.target.value)}
                                      className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                                  />
                                  <Palette className="absolute inset-0 m-auto h-3 w-3 pointer-events-none mix-blend-difference text-white opacity-50" />
                              </div>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <div className="relative">
                              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                              <Input 
                                  placeholder="Zoek icoon..." 
                                  className="h-10 pl-9 font-bold rounded-xl border-slate-200 bg-white"
                                  value={iconSearch}
                                  onChange={e => setIconSearch(e.target.value)}
                              />
                          </div>
                          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar p-1">
                              {filteredIcons.map(name => {
                                  const Icon = (Icons as any)[name];
                                  return (
                                      <Button 
                                          key={name} 
                                          type="button" 
                                          variant={selectedIconName === name ? "default" : "outline"} 
                                          size="icon" 
                                          className="h-10 w-10 p-0 rounded-xl" 
                                          onClick={() => setSelectedIconName(name)}
                                          title={name}
                                      >
                                          <Icon className="h-5 w-5" style={{ color: selectedIconName === name ? undefined : selectedColor }} />
                                      </Button>
                                  );
                              })}
                          </div>
                      </div>
                  </TabsContent>

                  <TabsContent value="upload" className="space-y-4 mt-0">
                      <div className="flex items-center gap-4">
                          <Button variant="outline" className="h-24 w-full flex-col gap-2 rounded-3xl border-dashed border-2 border-slate-200 bg-white" onClick={() => document.getElementById('icon-upload-input')?.click()} disabled={isUploading}>
                              {isUploading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-slate-300" />}
                              <span className="text-[10px] font-black uppercase text-slate-400">Kies Afbeelding</span>
                          </Button>
                          <input type="file" id="icon-upload-input" className="hidden" accept="image/*" onChange={handleFileUpload} />
                      </div>
                  </TabsContent>

                  <TabsContent value="html" className="space-y-4 mt-0">
                      <Textarea 
                          placeholder="Plak hier uw <svg> code..." 
                          className="font-mono text-[10px] min-h-[150px] rounded-2xl border-slate-200 p-4 leading-relaxed"
                          value={htmlIcon}
                          onChange={e => setHtmlIcon(e.target.value)}
                      />
                  </TabsContent>
              </Tabs>

              <Button onClick={handleSave} disabled={isSaving || isUploading || (!editTarget && !newName.trim())} className="w-full h-12 font-black uppercase shadow-xl shadow-primary/20 rounded-2xl text-xs">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                {editTarget ? 'Wijzigingen Opslaan' : 'Nieuw Type Toevoegen'}
              </Button>
              {editTarget && <Button variant="ghost" onClick={() => setEditTarget(null)} className="w-full h-10 font-black uppercase text-[10px] text-slate-400">Annuleren</Button>}
            </div>

            {!editTarget && (
              <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Huidige Types ({currentOptions.length})</Label>
                  <div className="grid gap-2">
                  {currentOptions.map(name => (
                      <div key={name} className="flex items-center justify-between p-3 bg-white border-2 border-slate-100 rounded-2xl group hover:border-primary/20 transition-all shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 shadow-inner flex items-center justify-center w-10 h-10 shrink-0">
                                {renderCurrentIcon(categoryIcons[name])}
                            </div>
                            <span className="text-sm font-black uppercase tracking-tight text-slate-700">{name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-300 hover:text-primary hover:bg-primary/5" onClick={() => setEditTarget(name)}>
                                <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(name)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                      </div>
                  ))}
                  </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ManageSubtypeDialog({ open, onOpenChange, parentCategory, currentSubtypes, allSubtypesMap }: { 
  open: boolean, 
  onOpenChange: (open: boolean) => void, 
  parentCategory: string,
  currentSubtypes: string[],
  allSubtypesMap: Record<string, string[]>
}) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [newName, setNewName] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const handleAdd = async () => {
    if (!newName.trim() || !firestore || !parentCategory) return;
    setIsSaving(true);
    try {
      const updatedSubtypes = Array.from(new Set([...currentSubtypes, newName.trim()]));
      const newMap = { ...allSubtypesMap, [parentCategory]: updatedSubtypes };
      
      await setDocumentNonBlocking(doc(firestore, 'settings', 'issue_options'), {
        subcategorieen: newMap
      }, { merge: true });
      
      toast({ title: 'Subtype toegevoegd' });
      setNewName('');
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Fout bij opslaan' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!firestore || !parentCategory) return;
    try {
      const updatedSubtypes = currentSubtypes.filter(o => o !== name);
      const newMap = { ...allSubtypesMap, [parentCategory]: updatedSubtypes };

      await setDocumentNonBlocking(doc(firestore, 'settings', 'issue_options'), {
        subcategorieen: newMap
      }, { merge: true });
      
      toast({ title: 'Subtype verwijderd' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Fout bij verwijderen' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50 border-b">
          <DialogTitle className="font-black uppercase">Subtypes voor: {parentCategory}</DialogTitle>
          <DialogDescription>Beheer specifieke onderdelen binnen dit hoofdtype.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 p-6">
          <div className="flex gap-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nieuw subtype..." className="font-bold h-11 rounded-xl" />
            <Button onClick={handleAdd} disabled={!newName.trim() || isSaving} className="h-11 font-black uppercase rounded-xl px-6">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Actieve Subtypes</Label>
            <ScrollArea className="h-64 rounded-2xl border-2 border-slate-50 p-2 bg-slate-50/30 shadow-inner">
              <div className="grid gap-1">
                {currentSubtypes.map(name => (
                  <div key={name} className="flex items-center justify-between p-3 bg-white rounded-xl border border-transparent shadow-sm group">
                    <span className="text-xs font-black uppercase tracking-tight text-slate-700">{name}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function NewIssuePage() {
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { profile } = useProfile();
  const { startProcessing } = useGlobalLoading();
  const app = useFirebaseApp();
  const isMobile = useIsMobile();
  
  const meldingId = searchParams.get('id');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = React.useState<UploadedFile[]>([]);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  const [containerSuggestions, setContainerSuggestions] = React.useState<MapObject[]>([]);

  // Category management state
  const [isManageHoofdtypeOpen, setIsManageHoofdtypeOpen] = React.useState(false);
  const [isManageSubtypeOpen, setIsManageSubtypeOpen] = React.useState(false);

  const optionsRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'issue_options') : null, [firestore]);
  const { data: dbOptions } = useDoc<any>(optionsRef);

  const statuses = dbOptions?.statuses || DEFAULT_STATUS_OPTIONS;
  const soortenMelder = dbOptions?.soortenMelder || DEFAULT_MELDER_TYPES;
  const hoofdcategorieen = dbOptions?.hoofdcategorieen || DEFAULT_HOOFDCATEGORIE_OPTIONS;
  const subcategorieenMap = dbOptions?.subcategorieen || DEFAULT_SUBCATEGORIE_MAPPING;
  const categoryIcons = dbOptions?.categoryIcons || {};

  const aiConfigRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'pdf_config') : null, [firestore]);
  const { data: aiConfig } = useDoc<{ instructions: string }>(aiConfigRef);

  const projectsQuery = useMemoFirebase(() => firestore ? collection(firestore, 'projects') : null, [firestore]);
  const { data: projects } = useCollection<Project>(projectsQuery);

  const meldingRef = useMemoFirebase(() => {
    if (!firestore || !meldingId) return null;
    return doc(firestore, 'meldingen', meldingId);
  }, [firestore, meldingId]);

  const { data: existingMelding } = useDoc<Melding>(meldingRef);

  const objectsSearchQuery = useMemoFirebase(() => firestore ? collection(firestore, 'objects') : null, [firestore]);
  const { data: allMapObjects } = useCollection<MapObject>(objectsSearchQuery);

  const form = useForm<NewMeldingFormValues>({
    resolver: zodResolver(newMeldingSchema),
    defaultValues: {
      intakenummer: format(new Date(), 'yyyyMMdd'), 
      status: 'Nieuw', 
      meldingsdatum: new Date(), 
      meldingsuur: format(new Date(), 'HH:mm'),
      aangenomen_door: profile?.displayName || profile?.email || '',
      voorvaldatum: new Date(), 
      voorvaltijd: format(new Date(), 'HH:mm'), 
      hoofdcategorie: '', 
      subcategorie: '',
      plaats: '', 
    },
  });

  const isReadOnly = React.useMemo(() => {
    if (!existingMelding) return false;
    return ['Afgerond', 'Niet in beheer', 'Geweigerd', 'Dubbel gemeld'].includes(existingMelding.status);
  }, [existingMelding]);

  React.useEffect(() => {
    if (existingMelding) {
      form.reset({
        ...existingMelding,
        meldingsdatum: existingMelding.datum ? new Date(existingMelding.datum) : null,
        voorvaldatum: existingMelding.voorvaldatum ? new Date(existingMelding.voorvaldatum) : null,
      });
      setUploadedFiles(existingMelding.files || []);
      setUploadedPhotos(existingMelding.fotos || []);
      setLocation({ latitude: existingMelding.latitude, longitude: existingMelding.longitude });
    }
  }, [existingMelding, form]);

  React.useEffect(() => {
    if (!meldingId && profile && !form.getValues('aangenomen_door')) {
      form.setValue('aangenomen_door', profile.displayName || profile.email || '');
    }
  }, [profile, meldingId, form]);

  const watchStraat = form.watch('straatnaam');
  const watchHuisnummer = form.watch('huisnummer');
  const watchPlaats = form.watch('plaats');

  React.useEffect(() => {
    const geocodeAddress = async () => {
      if (!watchStraat || !watchPlaats || isReadOnly) return;
      
      const fullAddress = `${watchStraat} ${watchHuisnummer || ''}, ${watchPlaats}, Nederland`;
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_TOKEN}&country=NL&limit=1`
        );
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          setLocation({ latitude: lat, longitude: lng });
        }
      } catch (error) {
        console.error('Geocoding error:', error);
      }
    };

    const timer = setTimeout(geocodeAddress, 800);
    return () => clearTimeout(timer);
  }, [watchStraat, watchHuisnummer, watchPlaats, isReadOnly]);

  // Filter nearby objects for the map preview (100m radius)
  const nearbyObjects = React.useMemo(() => {
    if (!allMapObjects || !location) return [];
    const issuePt = turf.point([location.longitude, location.latitude]);
    return allMapObjects.filter(obj => {
      if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') return false;
      const objPt = turf.point([obj.longitude, obj.latitude]);
      return turf.distance(issuePt, objPt, { units: 'meters' }) <= 100;
    });
  }, [allMapObjects, location]);

  // Effect to automatically determine Werkgebied (Wijk) based on location
  React.useEffect(() => {
    if (location && projects && !isReadOnly) {
      const point = turf.point([location.longitude, location.latitude]);
      let foundWijk = '';

      for (const project of projects) {
        if (project.wijken) {
          for (const wijk of project.wijken) {
            try {
              const features = JSON.parse(wijk.subGebieden);
              if (Array.isArray(features)) {
                for (const feature of features) {
                  if (turf.booleanPointInPolygon(point, feature)) {
                    foundWijk = wijk.naam;
                    break;
                  }
                }
              }
            } catch (e) {
              // ignore invalid geojson
            }
            if (foundWijk) break;
          }
        }
        if (foundWijk) break;
      }

      if (foundWijk) {
        form.setValue('werkgebied', foundWijk);
      }
    }
  }, [location, projects, form, isReadOnly]);

  const watchContainernummer = form.watch('containernummer');
  React.useEffect(() => {
    if (!watchContainernummer || watchContainernummer.length < 2 || isReadOnly || !allMapObjects) {
      setContainerSuggestions([]);
      return;
    }
    const q = watchContainernummer.toLowerCase();
    const filtered = allMapObjects.filter(obj => 
      (obj.idNummer || '').toLowerCase().includes(q) ||
      (obj.id || '').toLowerCase().includes(q)
    ).slice(0, 15);
    setContainerSuggestions(filtered);
  }, [watchContainernummer, allMapObjects, isReadOnly]);

  const handleContainerSelect = (obj: MapObject) => {
    form.setValue('containernummer', obj.idNummer || obj.id);
    
    let rawStreet = obj.straatnaam || '';
    let houseNumber = obj.huisnummer || '';
    let postcode = obj.postcode || '';
    let city = obj.plaats || '';
    
    if (rawStreet && (!houseNumber || !postcode || !city)) {
        const postcodeMatch = rawStreet.match(/(\d{4}\s?[A-Z]{2})/i);
        if (postcodeMatch) {
            const pc = postcodeMatch[0];
            const parts = rawStreet.split(pc);
            if (!postcode) postcode = pc.toUpperCase();
            const before = parts[0].trim().replace(/,$/, '').trim();
            const after = parts[1] ? parts[1].trim().replace(/^,/, '').trim() : '';
            if (!city && after) city = after;
            if (!houseNumber) {
                const hnMatch = before.match(/(\d+.*)$/);
                if (hnMatch) {
                    houseNumber = hnMatch[0];
                    rawStreet = before.substring(0, hnMatch.index!).trim();
                } else {
                    rawStreet = before;
                }
            } else {
                rawStreet = before;
            }
        } else {
            if (!houseNumber) {
                const hnMatch = rawStreet.match(/^(.*?)\s*(\d+.*)$/);
                if (hnMatch) {
                    rawStreet = hnMatch[1].trim();
                    houseNumber = hnMatch[2].trim();
                }
            }
        }
    }
    
    form.setValue('straatnaam', rawStreet);
    form.setValue('huisnummer', houseNumber);
    form.setValue('postcode', postcode);
    form.setValue('plaats', city);
    if (obj.wijk) form.setValue('wijk', obj.wijk);
    
    setLocation({ latitude: obj.latitude, longitude: obj.longitude });
    setContainerSuggestions([]);
  };

  const handleFileUpload = async (files: FileList | File[], type: 'files' | 'fotos') => {
    if (!files.length || !app || isReadOnly) return;
    const storage = getStorage(app);
    for (const file of Array.from(files)) {
      const path = `meldingen/${Date.now()}_${file.name}`;
      const task = uploadBytesResumable(ref(storage, path), file);
      await task;
      const url = await getDownloadURL(task.snapshot.ref);
      const uploaded = { name: file.name, url, size: file.size, type: file.type, uploadedAt: new Date().toISOString(), storagePath: path };
      if (type === 'files') setUploadedFiles(prev => [...prev, uploaded]); else setUploadedPhotos(prev => [...prev, uploaded]);
    }
  };

  const onSubmit = (data: NewMeldingFormValues) => {
    if (!firestore || isSubmitting || isReadOnly) return;
    setIsSubmitting(true);
    
    const mData: any = {
      ...data,
      voorvaldatum: data.voorvaldatum instanceof Date ? format(data.voorvaldatum, 'yyyy-MM-dd') : (data.voorvaldatum || null),
      meldingsdatum: data.meldingsdatum instanceof Date ? format(data.meldingsdatum, 'yyyy-MM-dd') : (data.meldingsdatum || null),
      datum: data.meldingsdatum instanceof Date ? format(data.meldingsdatum, 'yyyy-MM-dd') : (data.meldingsdatum || null),
      latitude: location?.latitude || 0,
      longitude: location?.longitude || 0,
      files: uploadedFiles,
      fotos: uploadedPhotos,
      updatedAt: serverTimestamp(),
    };

    // Clean up undefined values for Firestore
    Object.keys(mData).forEach(key => mData[key] === undefined && delete mData[key]);

    if (meldingId) {
      updateDocumentNonBlocking(doc(firestore, 'meldingen', meldingId), mData);
      toast({ title: "Melding bijgewerkt" });
      router.push('/issues/portal');
    } else {
      mData.createdAt = serverTimestamp();
      addDocumentNonBlocking(collection(firestore, 'meldingen'), mData).then(() => {
        toast({ title: "Melding opgeslagen", description: `Melding ${data.intakenummer} is aangemaakt.` });
        startProcessing(1000);
        router.push('/issues/portal');
      }).catch(() => {
        setIsSubmitting(false);
      });
    }
  };

  const currentHoofdcategorie = form.watch('hoofdcategorie');
  const subcategorieen = subcategorieenMap[currentHoofdcategorie] || ["Overig"];

  const renderMediaAndMap = () => (
    <div className="space-y-4">
      <Card className="rounded-2xl overflow-hidden shadow-sm border-slate-200">
        <CardHeader className="bg-slate-50 border-b py-2 px-4">
          <CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Locatie Preview</CardTitle>
        </CardHeader>
        <div className="h-48 w-full relative bg-slate-100">
          <MapboxView 
            latitude={location?.latitude || 52.1326} 
            longitude={location?.longitude || 5.2913} 
            interactive={false} 
            objects={nearbyObjects} 
          />
          {!location && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
              <p className="text-[9px] font-black uppercase tracking-widest">Wacht op locatiegegevens...</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="rounded-2xl bg-white shadow-sm border-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50 border-b py-2 px-4">
          <CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Media & Bijlagen</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {uploadedPhotos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {uploadedPhotos.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border group">
                  <Image src={p.url} alt="foto" fill className="object-cover" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-1 right-1 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setUploadedPhotos(prev => prev.filter(x => x.storagePath !== p.storagePath))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center opacity-20">
              <Camera className="h-6 w-6 mx-auto mb-1 text-slate-400" />
              <p className="text-[8px] font-black uppercase tracking-widest">Geen foto's</p>
            </div>
          )}
          
          <Separator className="bg-slate-100" />

          {uploadedFiles.length > 0 ? (
            <div className="space-y-2">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 truncate">
                    <FileIcon className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-xs font-bold truncate">{f.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-600" onClick={() => setUploadedFiles(prev => prev.filter(x => x.storagePath !== f.storagePath))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center opacity-20">
              <FileIcon className="h-6 w-6 mx-auto mb-1 text-slate-400" />
              <p className="text-[8px] font-black uppercase tracking-widest">Geen documenten</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className={cn("flex flex-col bg-slate-50", !isMobile ? "h-[calc(100vh-5rem)] overflow-hidden" : "min-h-screen")}>
        <header className="h-14 bg-white border-b flex items-center justify-between px-4 md:px-6 shrink-0 shadow-sm z-10 sticky top-0">
            <div className="flex items-center gap-2">
                {!isReadOnly && (
                    <>
                        <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200 rounded-xl" onClick={() => document.getElementById('media-doc-input')?.click()}>
                            <UploadCloud className="h-4 w-4 text-primary" /> <span className="hidden sm:inline">DOC</span>
                            <input type="file" id="media-doc-input" className="hidden" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'files')} />
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 font-black gap-2 border-slate-200 rounded-xl" onClick={() => document.getElementById('media-photo-input')?.click()}>
                            <Camera className="h-4 w-4 text-green-600" /> <span className="hidden sm:inline">FOTO</span>
                            <input type="file" id="media-photo-input" className="hidden" accept="image/*" multiple onChange={(e) => e.target.files && handleFileUpload(e.target.files, 'fotos')} />
                        </Button>
                    </>
                )}
            </div>
            <div className="flex items-center gap-2">
                {!isReadOnly && (
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="h-9 w-9 border-slate-200 rounded-xl">
                                    <MoreHorizontal className="h-4 w-4 text-slate-600" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl p-2">
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="rounded-lg h-10 cursor-pointer font-bold text-green-600">
                                    <IssueImportDialog open={isImporting} onOpenChange={setIsImporting} onSuccess={() => setIsImporting(false)}>
                                        <div className="flex items-center w-full">
                                            <FileSpreadsheet className="mr-2 h-4 w-4" /> EXCEL Import
                                        </div>
                                    </IssueImportDialog>
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="rounded-lg h-10 cursor-pointer font-bold text-slate-600">
                                    <SmartPasteDialog 
                                        onParsed={(d) => form.reset({ ...form.getValues(), ...d })} 
                                        instructions={aiConfig?.instructions || ''} 
                                        trigger={
                                            <div className="flex items-center w-full">
                                                <ClipboardPaste className="mr-2 h-4 w-4" /> Smart Paste
                                            </div>
                                        }
                                    />
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Separator orientation="vertical" className="h-5 mx-1" />
                        <Button type="submit" form="new-melding-form" size="sm" disabled={isSubmitting} className="h-9 font-black uppercase px-4 md:px-8 shadow-lg rounded-xl">
                            {isSubmitting ? <Loader2 className="mr-2 h-3 w-3 lg:h-4 lg:w-4 animate-spin" /> : <Check className="mr-2 h-3 w-3 lg:h-4 lg:w-4" />} {meldingId ? 'BIJWERKEN' : 'OPSLAAN'}
                        </Button>
                    </>
                )}
                {isReadOnly && <Badge className="bg-primary text-white font-black uppercase px-4 h-9 rounded-xl">ARCHIEF (READ-ONLY)</Badge>}
            </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto no-scrollbar">
            <Form {...form}>
              <form id="new-melding-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {isMobile ? (
                  <div className="space-y-4">
                    <Accordion type="multiple" defaultValue={[]} className="w-full">
                      <AccordionItem value="section-1" className="border-none">
                        <AccordionTrigger className="hover:no-underline py-3 px-4 bg-white rounded-xl mb-2 shadow-sm border border-slate-100">
                          <span className="text-xs font-black uppercase tracking-widest text-slate-900">Basisgegevens</span>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 pt-0 space-y-2 relative overflow-visible">
                          <FormRow label={<>Meldingsnummer<span className="text-red-500">*</span></>}>
                            <FormField control={form.control} name="intakenummer" render={({ field, fieldState }) => (
                              <FormItem><FormControl><Input {...field} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </FormRow>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label={<>Datum<span className="text-red-500">*</span></>}>
                              <FormField control={form.control} name="meldingsdatum" render={({ field, fieldState }) => (
                                <FormItem><FormControl><Input type="date" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </FormRow>
                            <FormRow label={<>Tijdstip<span className="text-red-500">*</span></>}>
                              <FormField control={form.control} name="meldingsuur" render={({ field, fieldState }) => (
                                <FormItem><FormControl><Input type="time" {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </FormRow>
                          </div>
                          <FormRow label={<>Aangenomen door<span className="text-red-500">*</span></>}>
                            <FormField control={form.control} name="aangenomen_door" render={({ field, fieldState }) => (
                              <FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </FormRow>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label="Extern Nr.">
                              <FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (
                                <FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-11 font-bold" /></FormControl></FormItem>
                              )} />
                            </FormRow>
                            <FormRow label="Status">
                              <FormField control={form.control} name="status" render={({ field }) => (
                                <FormItem>
                                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                                    <FormControl><SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>{statuses.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                  </Select>
                                </FormItem>
                              )} />
                            </FormRow>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label="Containernr.">
                              <FormField control={form.control} name="containernummer" render={({ field }) => (
                                <FormItem className="relative">
                                  <FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-11 font-bold" autoComplete="off" /></FormControl>
                                  {containerSuggestions.length > 0 && (
                                    <div className="absolute z-[100] w-[150%] left-0 mt-1 bg-white border-2 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                                      <ScrollArea className="max-h-60">
                                        {containerSuggestions.map(obj => (
                                          <button key={obj.id} type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0 flex flex-col gap-0.5" onClick={() => handleContainerSelect(obj)}>
                                            <p className="font-black text-[10px] uppercase text-slate-900">{obj.idNummer || obj.id}</p>
                                            <p className="text-[9px] font-bold text-slate-400 truncate">{obj.straatnaam} {obj.huisnummer} • {obj.plaats}</p>
                                          </button>
                                        ))}
                                      </ScrollArea>
                                    </div>
                                  )}
                                </FormItem>
                              )} />
                            </FormRow>
                            <FormRow label={<>Melder<span className="text-red-500">*</span></>}>
                              <FormField control={form.control} name="soort_melder" render={({ field, fieldState }) => (
                                <FormItem>
                                  <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                                    <FormControl><SelectTrigger className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                    <SelectContent>{soortenMelder.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                  </Select>
                                </FormItem>
                              )} />
                            </FormRow>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="section-2" className="border-none">
                        <AccordionTrigger className="hover:no-underline py-3 px-4 bg-white rounded-xl mb-2 shadow-sm border border-slate-100">
                          <span className="text-xs font-black uppercase tracking-widest text-slate-900">Locatie & Gebied</span>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 pt-0 space-y-2">
                          <FormRow label={<>Straatnaam<span className="text-red-500">*</span></>}>
                            <FormField control={form.control} name="straatnaam" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} />
                          </FormRow>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label={<>Huisnr.<span className="text-red-500">*</span></>}>
                              <FormField control={form.control} name="huisnummer" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} />
                            </FormRow>
                            <FormRow label="Plaats">
                              <FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-11 font-bold" /></FormControl></FormItem>)} />
                            </FormRow>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label="Postcode">
                              <FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-11 font-bold" /></FormControl></FormItem>)} />
                            </FormRow>
                            <FormRow label="Werkgebied">
                              <FormField control={form.control} name="werkgebied" render={({ field }) => (
                                <FormItem><FormControl><Input {...field} value={field.value || ''} disabled className="h-11 font-black bg-slate-50 text-primary border-primary/20" /></FormControl></FormItem>
                              )} />
                            </FormRow>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="section-3" className="border-none">
                        <AccordionTrigger className="hover:no-underline py-3 px-4 bg-white rounded-xl mb-2 shadow-sm border border-slate-100">
                          <span className="text-xs font-black uppercase tracking-widest text-slate-900">Omschrijving</span>
                        </AccordionTrigger>
                        <AccordionContent className="p-4 pt-0 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label={<>Hoofdtype<span className="text-red-500">*</span></>} onAdd={() => setIsManageHoofdtypeOpen(true)}>
                              <FormField control={form.control} name="hoofdcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}><FormControl><SelectTrigger className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{hoofdcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} />
                            </FormRow>
                            <FormRow label={<>Subtype<span className="text-red-500">*</span></>} onAdd={() => setIsManageSubtypeOpen(true)}>
                              <FormField control={form.control} name="subcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly || !currentHoofdcategorie}><FormControl><SelectTrigger className={cn("h-11 font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{subcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} />
                            </FormRow>
                          </div>
                          <FormRow label="Memo">
                            <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                              <FormItem><FormControl><Textarea {...field} value={field.value || ''} disabled={isReadOnly} className="resize-none min-h-[120px] font-bold" placeholder="Aanvullende info..." /></FormControl></FormItem>
                            )} />
                          </FormRow>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                    
                    {/* Always visible components on mobile */}
                    {renderMediaAndMap()}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-4">
                      <Card className="rounded-2xl bg-white shadow-sm border-slate-200 relative overflow-visible">
                        <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Hoofdgegevens</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-2">
                          <FormRow label={<>Meldingsnummer<span className="text-red-500">*</span></>}>
                            <FormField control={form.control} name="intakenummer" render={({ field, fieldState }) => (
                              <FormItem><FormControl><Input {...field} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </FormRow>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label={<>Datum<span className="text-red-500">*</span></>}>
                              <FormField control={form.control} name="meldingsdatum" render={({ field, fieldState }) => (
                                <FormItem><FormControl><Input type="date" value={field.value ? format(new Date(field.value), 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.valueAsDate)} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </FormRow>
                            <FormRow label={<>Tijdstip<span className="text-red-500">*</span></>}>
                              <FormField control={form.control} name="meldingsuur" render={({ field, fieldState }) => (
                                <FormItem><FormControl><Input type="time" {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                              )} />
                            </FormRow>
                          </div>
                          <FormRow label={<>Aangenomen door<span className="text-red-500">*</span></>}>
                            <FormField control={form.control} name="aangenomen_door" render={({ field, fieldState }) => (
                              <FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl><FormMessage /></FormItem>
                            )} />
                          </FormRow>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label="Extern Nr."><FormField control={form.control} name="extern_meldingsnummer" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                            <FormRow label="Status">
                              <FormField control={form.control} name="status" render={({ field }) => (
                                <FormItem>
                                  <Select onValueChange={field.onChange} value={field.value} disabled={isReadOnly}>
                                    <FormControl><SelectTrigger className="h-8 text-xs font-bold"><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>{statuses.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                  </Select>
                                </FormItem>
                              )} />
                            </FormRow>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label="Containernr.">
                              <FormField control={form.control} name="containernummer" render={({ field }) => (
                                <FormItem className="relative">
                                  <FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" autoComplete="off" /></FormControl>
                                  {containerSuggestions.length > 0 && (
                                    <div className="absolute z-[100] w-[150%] left-0 mt-1 bg-white border-2 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                                      <ScrollArea className="max-h-60">
                                        {containerSuggestions.map(obj => (
                                          <button key={obj.id} type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0 flex flex-col gap-0.5" onClick={() => handleContainerSelect(obj)}>
                                            <p className="font-black text-[10px] uppercase text-slate-900">{obj.idNummer || obj.id}</p>
                                            <p className="text-[9px] font-bold text-slate-400 truncate">{obj.straatnaam} {obj.huisnummer} • {obj.plaats}</p>
                                          </button>
                                        ))}
                                      </ScrollArea>
                                    </div>
                                  )}
                                </FormItem>
                              )} />
                            </FormRow>
                            <FormRow label={<>Soort Melder<span className="text-red-500">*</span></>}>
                              <FormField control={form.control} name="soort_melder" render={({ field, fieldState }) => (
                                <FormItem>
                                  <Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}>
                                    <FormControl><SelectTrigger className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl>
                                    <SelectContent>{soortenMelder.map(opt => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                                  </Select>
                                </FormItem>
                              )} />
                            </FormRow>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="rounded-2xl bg-white shadow-sm border-slate-200 overflow-hidden">
                        <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Locatie & Gebied</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-2 space-y-3">
                          <FormRow label={<>Straatnaam<span className="text-red-500">*</span></>}><FormField control={form.control} name="straatnaam" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} /></FormRow>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <FormRow label={<>Huisnr.<span className="text-red-500">*</span></>}><FormField control={form.control} name="huisnummer" render={({ field, fieldState }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")} /></FormControl></FormItem>)} /></FormRow>
                            <FormRow label="Postcode"><FormField control={form.control} name="postcode" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <FormRow label="Plaats"><FormField control={form.control} name="plaats" render={({ field }) => (<FormItem><FormControl><Input {...field} value={field.value || ''} disabled={isReadOnly} className="h-8 text-xs font-bold" /></FormControl></FormItem>)} /></FormRow>
                            <FormRow label={<span className="flex items-center gap-1"><LayoutGrid className="h-3 w-3" /> Werkgebied</span>}>
                              <FormField control={form.control} name="werkgebied" render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input {...field} value={field.value || ''} disabled className="h-8 text-[10px] font-black uppercase bg-slate-50 text-primary border-primary/20 shadow-inner" placeholder="Wordt berekend..." />
                                  </FormControl>
                                </FormItem>
                              )} />
                            </FormRow>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-4">
                      <Card className="rounded-2xl bg-white shadow-sm border-slate-200 overflow-hidden">
                        <CardHeader className="bg-slate-50 border-b py-2 px-4"><CardTitle className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Categorie & Melder</CardTitle></CardHeader>
                        <CardContent className="p-4 pt-2">
                          <div className="grid grid-cols-2 gap-3">
                            <FormRow label={<>Hoofdtype<span className="text-red-500">*</span></>} onAdd={() => setIsManageHoofdtypeOpen(true)}>
                              <FormField control={form.control} name="hoofdcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly}><FormControl><SelectTrigger className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{hoofdcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} /></FormRow>
                            <FormRow label={<>Subtype<span className="text-red-500">*</span></>} onAdd={() => setIsManageSubtypeOpen(true)}>
                              <FormField control={form.control} name="subcategorie" render={({ field, fieldState }) => (<FormItem><Select onValueChange={field.onChange} value={field.value || ''} disabled={isReadOnly || !currentHoofdcategorie}><FormControl><SelectTrigger className={cn("h-8 text-xs font-bold", fieldState.error && "border-4 border-destructive")}><SelectValue placeholder="Kies..." /></SelectTrigger></FormControl><SelectContent>{subcategorieen.map(o => (<SelectItem key={o} value={o}>{o}</SelectItem>))}</SelectContent></Select></FormItem>)} /></FormRow>
                          </div>
                          <FormRow label="Memo">
                            <FormField control={form.control} name="extra_informatie" render={({ field }) => (
                              <FormItem><FormControl><Textarea {...field} value={field.value || ''} disabled={isReadOnly} className="resize-none min-h-[100px] text-xs font-medium border-slate-100 bg-slate-50/30" placeholder="Aanvullende info..." /></FormControl></FormItem>
                            )} />
                          </FormRow>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-4">
                      {renderMediaAndMap()}
                    </div>
                  </div>
                )}
              </form>
            </Form>
        </main>

        <ManageHoofdtypeDialog 
          open={isManageHoofdtypeOpen} 
          onOpenChange={setIsManageHoofdtypeOpen} 
          currentOptions={hoofdcategorieen}
          categoryIcons={categoryIcons}
        />
        <ManageSubtypeDialog 
          open={isManageSubtypeOpen} 
          onOpenChange={setIsManageSubtypeOpen} 
          parentCategory={currentHoofdcategorie}
          currentSubtypes={subcategorieen}
          allSubtypesMap={subcategorieenMap}
        />
    </div>
  );
}
