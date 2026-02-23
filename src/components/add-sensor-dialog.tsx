'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFirestore, setDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { Loader2, MapPin, Search, Info, Ruler, Cpu, Radio, ChevronRight, ChevronLeft, CheckCircle2, Zap, Globe, FileCode } from 'lucide-react';
import { MapboxView } from './mapbox-view';
import type { Object as MapObject } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Separator } from './ui/separator';

const sensorSchema = z.object({
  id: z.string().min(1, 'Serienummer is verplicht (bv. Chip ID of DevEUI)').toUpperCase(),
  name: z.string().min(1, 'Naam is verplicht'),
  type: z.string().default('TOF200C'),
  binDepthCm: z.coerce.number().min(1, 'Voer een diepte in groter dan 0'),
  measurementFrequency: z.coerce.number().min(1, 'Voer een frequentie in (minimaal 1)').max(1440, 'Maximaal elke minuut'),
  devEui: z.string().optional(),
  appEui: z.string().min(1, 'AppEUI is verplicht voor KPN koppeling'),
  appKey: z.string().min(1, 'AppKey is verplicht voor KPN koppeling'),
});

type SensorFormValues = z.infer<typeof sensorSchema>;

const STEPS = [
  { id: 'object', title: 'Unit Selectie', icon: MapPin },
  { id: 'hardware', title: 'Identiteit', icon: Cpu },
  { id: 'network', title: 'KPN Setup', icon: Radio },
  { id: 'config', title: 'Configuratie', icon: Ruler },
  { id: 'instructions', title: 'Koppeling', icon: Globe },
];

export function AddSensorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const firestore = useFirestore();
  const [currentStep, setCurrentStep] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [location, setLocation] = React.useState<{ latitude: number; longitude: number } | null>(null);
  
  const [objectSearchQuery, setObjectSearchQuery] = React.useState('');
  const [selectedObject, setSelectedObject] = React.useState<MapObject | null>(null);

  const objectsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'objects');
  }, [firestore]);
  const { data: allObjects } = useCollection<MapObject>(objectsQuery);

  const filteredObjects = React.useMemo(() => {
    if (!objectSearchQuery.trim() || !allObjects) return [];
    const q = objectSearchQuery.toLowerCase();
    return allObjects.filter(obj => 
      obj.id.toLowerCase().includes(q) || 
      obj.straatnaam?.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [allObjects, objectSearchQuery]);

  const form = useForm<SensorFormValues>({
    resolver: zodResolver(sensorSchema),
    defaultValues: { 
      id: '', 
      name: '', 
      type: 'TOF200C',
      binDepthCm: 100,
      measurementFrequency: 24,
      devEui: '',
      appEui: '',
      appKey: '',
    },
  });

  const handleNext = async () => {
    const fields = getFieldsForStep(currentStep);
    const isValid = await form.trigger(fields as any);
    
    if (currentStep === 0 && !selectedObject) return;
    
    if (isValid) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const getFieldsForStep = (step: number) => {
    switch(step) {
      case 1: return ['id', 'name'];
      case 2: return ['appEui', 'appKey'];
      case 3: return ['binDepthCm', 'measurementFrequency'];
      default: return [];
    }
  };

  const handleObjectSelect = (obj: MapObject) => {
    setSelectedObject(obj);
    form.setValue('name', `Sensor ${obj.id}`);
    setLocation({ latitude: obj.latitude, longitude: obj.longitude });
    setObjectSearchQuery('');
  };

  const onSubmit = async (data: SensorFormValues) => {
    if (!firestore || !location) return;
    setIsSubmitting(true);
    try {
      const sensorRef = doc(firestore, 'sensors', data.id);
      await setDocumentNonBlocking(sensorRef, {
        ...data,
        status: 'Online',
        latitude: location.latitude,
        longitude: location.longitude,
        lastSeen: new Date().toISOString(),
        batteryLevel: 100,
        vulgraad: 0,
        currentDistanceCm: 0,
        createdAt: serverTimestamp(),
      }, { merge: true });
      
      onOpenChange(false);
      resetWizard();
    } catch (error) {
      console.error("Error adding sensor:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    setCurrentStep(0);
    form.reset();
    setLocation(null);
    setSelectedObject(null);
    setObjectSearchQuery('');
  };

  React.useEffect(() => {
    if (!open) {
      setTimeout(resetWizard, 300);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] p-0 overflow-hidden border-none shadow-2xl">
        <div className="flex flex-col h-[700px]">
          {/* Header & Progress */}
          <div className="bg-slate-900 text-white p-6 shrink-0">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-white text-xl font-black uppercase tracking-tight">Sensor Wizard</DialogTitle>
              <DialogDescription className="text-slate-400 font-bold">
                Koppel hardware aan platform en configureer KPN Things.
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex items-center justify-between relative px-2">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/10 -translate-y-1/2 z-0" />
              {STEPS.map((step, index) => {
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                return (
                  <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                      isActive ? "bg-primary border-primary scale-110 shadow-[0_0_15px_rgba(37,99,235,0.5)]" : 
                      isCompleted ? "bg-green-500 border-green-500" : "bg-slate-800 border-slate-700"
                    )}>
                      {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <step.icon className="h-4 w-4" />}
                    </div>
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest transition-colors",
                      isActive ? "text-white" : "text-slate-500"
                    )}>{step.title}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 bg-white">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
                
                {/* STEP 1: Object Selection */}
                {currentStep === 0 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">1. Selecteer Prullenbak</h3>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed">
                        Kies de unit waarin de hardware wordt gemonteerd. De data wordt hierdoor direct gekoppeld aan de GIS-locatie.
                      </p>
                    </div>
                    
                    <div className="relative">
                      <div className="relative flex items-center">
                        <Search className="absolute left-3 h-4 w-4 text-slate-400" />
                        <Input 
                          placeholder="Zoek op ID of straatnaam..." 
                          value={objectSearchQuery} 
                          onChange={(e) => setObjectSearchQuery(e.target.value)}
                          className="pl-10 h-12 font-bold border-2 focus:ring-primary/20"
                        />
                      </div>
                      
                      {filteredObjects.length > 0 && (
                        <div className="absolute z-50 w-full mt-2 bg-white border-2 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                          {filteredObjects.map(obj => (
                            <button
                              key={obj.id}
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-0 flex items-center justify-between group"
                              onClick={() => handleObjectSelect(obj)}
                            >
                              <div className="min-w-0">
                                <p className="font-black uppercase text-sm text-slate-900">{obj.id}</p>
                                <p className="text-xs text-slate-500 truncate">{obj.straatnaam} {obj.huisnummer}</p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedObject ? (
                      <div className="bg-blue-50 border-2 border-primary/20 p-4 rounded-2xl flex items-center gap-4 animate-in zoom-in-95">
                        <div className="bg-primary/10 p-3 rounded-xl"><MapPin className="h-6 w-6 text-primary" /></div>
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase text-primary tracking-widest">Unit Gekoppeld</p>
                          <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{selectedObject.id}</p>
                          <p className="text-xs font-bold text-slate-500">{selectedObject.straatnaam} {selectedObject.huisnummer}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedObject(null)} className="text-[10px] font-black uppercase h-7">Wijzig</Button>
                      </div>
                    ) : (
                      <div className="p-12 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-slate-300">
                        <MapPin className="h-12 w-12 mb-4 opacity-10" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-center">Zoek en selecteer een prullenbak om te beginnen</p>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: Hardware Identiteit */}
                {currentStep === 1 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">2. Identiteit Hardware</h3>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed">
                        Gebruik de unieke Chip ID (DevEUI) van uw board om het apparaat te registreren in BeheerHub.
                      </p>
                    </div>

                    <div className="grid gap-6">
                      <FormField
                        control={form.control}
                        name="id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Chip ID / DevEUI*</FormLabel>
                            <FormControl><Input placeholder="Bv. 0000B3A5..." {...field} className="font-mono h-11 border-2 font-bold" /></FormControl>
                            <FormDescription className="text-[10px]">Deze code ziet u in de Seriële Monitor bij het opstarten van de CubeCell.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Naam in Systeem</FormLabel>
                            <FormControl><Input placeholder="Bv. Sensor Bak Marktplein" {...field} className="h-11 border-2 font-bold" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 3: Network / KPN Keys */}
                {currentStep === 2 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">3. LoRaWAN Configuratie</h3>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed">
                        Kopieer de OTAA-sleutels uit KPN Things. Deze worden in de Arduino code verwerkt.
                      </p>
                    </div>

                    <div className="grid gap-6">
                      <FormField
                        control={form.control}
                        name="appEui"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">AppEUI / JoinEUI*</FormLabel>
                            <FormControl><Input placeholder="0059AC..." {...field} className="font-mono h-11 border-2 font-bold" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="appKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">AppKey*</FormLabel>
                            <FormControl><Input placeholder="••••••••••••••••" {...field} className="font-mono h-11 border-2 font-bold" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 4: Configuration */}
                {currentStep === 3 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                      <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">4. Kalibratie & Frequentie</h3>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed">
                        Stel de fysieke parameters in voor een correcte meting.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="binDepthCm"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Bak Diepte (cm)*</FormLabel>
                            <FormControl><Input type="number" {...field} className="h-11 border-2 font-bold" /></FormControl>
                            <FormDescription className="text-[10px]">Afstand van sensor tot bodem.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="measurementFrequency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Metingen per dag*</FormLabel>
                            <FormControl><Input type="number" {...field} className="h-11 border-2 font-bold" /></FormControl>
                            <FormDescription className="text-[10px]">Standaard: 2 (elke 12 uur).</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="bg-orange-50 border-2 border-orange-100 p-5 rounded-2xl space-y-3">
                        <h4 className="text-[10px] font-black uppercase text-orange-700 tracking-widest flex items-center gap-2">
                            <Zap className="h-3 w-3" /> Hardware Check
                        </h4>
                        <ul className="text-xs space-y-2 font-bold text-orange-800">
                            <li className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-blue-500" /> Blauw (Sensor) &rarr; SDA Pin</li>
                            <li className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-green-500" /> Groen (Sensor) &rarr; SCL Pin</li>
                        </ul>
                    </div>
                  </div>
                )}

                {/* STEP 5: Final Review & KPN Instructions */}
                {currentStep === 4 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2 text-center pb-2">
                      <div className="bg-green-100 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="h-10 w-10 text-green-600" />
                      </div>
                      <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Klaar om te koppelen!</h3>
                      <p className="text-sm text-slate-500 font-medium">BeheerHub is voorbereid. Doe na activatie het volgende in KPN Things:</p>
                    </div>

                    <div className="grid gap-3">
                        <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="bg-blue-100 p-2 rounded-xl shrink-0"><Globe className="h-4 w-4 text-blue-600" /></div>
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase">1. Maak HTTP Destination</p>
                                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Maak een nieuwe Destination aan in KPN Things. De unieke URL vind je straks in de 'KPN Koppeling' tab.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="bg-purple-100 p-2 rounded-xl shrink-0"><FileCode className="h-4 w-4 text-purple-600" /></div>
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase">2. Plak Payload Decoder</p>
                                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Kopieer de JavaScript decoder uit BeheerHub en plak deze bij de Payload settings in KPN.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="bg-orange-100 p-2 rounded-xl shrink-0"><Cpu className="h-4 w-4 text-orange-600" /></div>
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase">3. Flash Hardware</p>
                                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Upload de Arduino sketch naar de CubeCell. De unit zal automatisch 'joinen'.</p>
                            </div>
                        </div>
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-8 flex items-center justify-between border-t border-slate-100">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => currentStep === 0 ? onOpenChange(false) : setCurrentStep(prev => prev - 1)}
                    className="font-black uppercase tracking-tight text-slate-400 hover:text-slate-900"
                  >
                    {currentStep === 0 ? 'Annuleren' : <><ChevronLeft className="mr-2 h-4 w-4" /> Vorige</>}
                  </Button>
                  
                  {currentStep < STEPS.length - 1 ? (
                    <Button 
                      type="button" 
                      onClick={handleNext}
                      className="font-black uppercase tracking-tight px-8 h-11 shadow-lg shadow-primary/20"
                    >
                      Volgende <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="font-black uppercase tracking-tight px-12 h-11 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                    >
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Sensor Activeren
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
