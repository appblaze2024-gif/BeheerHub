'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useFirestore, useDoc, setDocumentNonBlocking, useMemoFirebase, useFirebaseApp, useUser } from '@/firebase';
import { doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useProfile } from '@/firebase/profile-provider';
import { Info, Loader2, Save, Sparkles, History, Pencil } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AppInfo {
  version: string;
  lastUpdate: string;
  description: string;
  appIconUrl?: string;
}

export function AppInfoDialog({ children }: { children: React.ReactNode }) {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { user } = useUser();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const infoRef = useMemoFirebase(() => 
    (firestore && user) ? doc(firestore, 'settings', 'app_info') : null, 
    [firestore, user]
  );
  
  const { data: appInfo, isLoading } = useDoc<AppInfo>(infoRef);

  const [formData, setFormData] = React.useState<AppInfo>({
    version: '1.0.0',
    lastUpdate: new Date().toISOString().split('T')[0],
    description: 'Welkom bij BeheerHub.',
    appIconUrl: 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png'
  });

  React.useEffect(() => {
    if (appInfo) {
      setFormData({
        version: appInfo.version || '1.0.0',
        lastUpdate: appInfo.lastUpdate || '',
        description: appInfo.description || '',
        appIconUrl: appInfo.appIconUrl || 'https://i.ibb.co/DgYjGBTt/Ontwerp-zonder-titel-5.png'
      });
    }
  }, [appInfo]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !app || !firestore) return;

    setIsUploading(true);
    try {
      const storage = getStorage(app);
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const storagePath = `settings/app_icons/${Date.now()}_${cleanFileName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      await uploadTask;
      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      setFormData(prev => ({ ...prev, appIconUrl: downloadURL }));
      toast({ title: 'Icoon geüpload', description: 'Vergeet niet de instellingen op te slaan.' });
    } catch (error) {
      console.error('Upload failed:', error);
      toast({ variant: 'destructive', title: 'Upload mislukt' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!infoRef) return;
    setIsSaving(true);
    try {
      await setDocumentNonBlocking(infoRef, formData, { merge: true });
      toast({ title: "App Info bijgewerkt", description: "De versie-informatie is succesvol opgeslagen." });
      setIsEditing(false);
    } catch (err) {
      toast({ variant: 'destructive', title: "Fout", description: "Kon informatie niet opslaan." });
    } finally {
      setIsSaving(false);
    }
  };

  const isSuperAdmin = profile?.role === 'Super admin';

  return (
    <Dialog onOpenChange={(open) => { if(!open) setIsEditing(false); }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="p-8 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20 mx-12">
              <Info className="h-6 w-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-white leading-none mb-1">Applicatie Informatie</DialogTitle>
              <DialogDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Versiebeheer & Systeemonderhoud</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-8 space-y-6 bg-white">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
            </div>
          ) : isEditing && isSuperAdmin ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4 mb-4">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="h-20 w-20 rounded-2xl border-2 border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center">
                    {isUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <img src={formData.appIconUrl} alt="App Icon" className="h-full w-full object-contain p-2" />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil className="h-4 w-4 text-white" />
                  </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">App Icoon Wijzigen</Label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Versie</Label>
                  <Input 
                    value={formData.version} 
                    onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))}
                    className="h-11 font-bold rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Datum Update</Label>
                  <Input 
                    type="date"
                    value={formData.lastUpdate} 
                    onChange={e => setFormData(prev => ({ ...prev, lastUpdate: e.target.value }))}
                    className="h-11 font-bold rounded-xl border-slate-200"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Update Details</Label>
                <Textarea 
                  value={formData.description} 
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="min-h-[120px] font-medium leading-relaxed rounded-xl border-slate-200 resize-none"
                  placeholder="Wat is er nieuw in deze versie?"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4">
                <div className="h-24 w-24 rounded-[2rem] border-4 border-slate-50 overflow-hidden bg-white shadow-2xl flex items-center justify-center">
                  <img src={formData.appIconUrl} alt="App Icon" className="h-full w-full object-contain p-3" />
                </div>
              </div>

              <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 shadow-inner">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none">Huidige Versie</p>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter">v{formData.version}</p>
                </div>
                <Badge className="bg-primary text-white border-none px-4 h-7 font-black uppercase tracking-widest text-[9px]">
                  Stable Release
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <History className="h-4 w-4 text-primary" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Laatste Wijzigingen ({formData.lastUpdate})</h3>
                </div>
                <p className="text-sm font-medium text-slate-600 leading-relaxed italic whitespace-pre-wrap">
                  {formData.description || "Geen update informatie beschikbaar."}
                </p>
              </div>

              <div className="pt-4 flex items-center gap-3 text-slate-300">
                <Sparkles className="h-4 w-4 opacity-50" />
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">Powered by BeheerHub Core Engine</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-slate-50 shrink-0">
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" onClick={() => setIsEditing(false)} className={cn("font-bold", !isEditing && "hidden")}>Annuleren</Button>
            <div className="flex gap-2 ml-auto">
              {isSuperAdmin && !isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(true)} className="font-bold rounded-xl border-slate-200">
                  <Pencil className="h-4 w-4 mr-2" /> Informatie bewerken
                </Button>
              )}
              {isEditing ? (
                <Button onClick={handleSave} disabled={isSaving} className="font-black uppercase tracking-tight px-8 shadow-xl shadow-primary/20 rounded-xl">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Opslaan
                </Button>
              ) : (
                <DialogClose asChild>
                  <Button variant="ghost" className="font-bold">Sluiten</Button>
                </DialogClose>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
