'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useFirestore, useDoc, setDocumentNonBlocking, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Save, Layout, ImageIcon, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export default function SettingsPage() {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const bannerRef = useMemoFirebase(() => firestore ? doc(firestore, 'settings', 'dashboard_banner') : null, [firestore]);
  const { data: banner, isLoading } = useDoc<any>(bannerRef);

  const [formData, setFormData] = React.useState({
    active: false,
    title: '',
    description: '',
    badgeText: '',
    imageUrl: ''
  });

  React.useEffect(() => {
    if (banner) {
      setFormData({
        active: banner.active || false,
        title: banner.title || '',
        description: banner.description || '',
        badgeText: banner.badgeText || '',
        imageUrl: banner.imageUrl || ''
      });
    }
  }, [banner]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !app || !firestore) return;

    setIsUploading(true);
    setUploadProgress(0);

    const storage = getStorage(app);
    const storagePath = `settings/banners/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error('Upload failed:', error);
        setIsUploading(false);
        setUploadProgress(null);
        toast({ variant: 'destructive', title: 'Upload mislukt', description: 'Kon de afbeelding niet uploaden.' });
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          setFormData(prev => ({ ...prev, imageUrl: downloadURL }));
          setIsUploading(false);
          setUploadProgress(null);
          toast({ title: 'Afbeelding geüpload', description: 'Vergeet niet de instellingen op te slaan.' });
        });
      }
    );
  };

  const handleSave = async () => {
    if (!bannerRef) return;
    setIsSaving(true);
    try {
      await setDocumentNonBlocking(bannerRef, formData, { merge: true });
      toast({ title: "Instellingen opgeslagen", description: "De dashboard banner is bijgewerkt." });
    } catch (err) {
      toast({ variant: 'destructive', title: "Fout", description: "Kon instellingen niet opslaan." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-6">Laden...</div>;

  return (
    <div className="flex flex-col flex-1 p-6 min-h-0 bg-slate-50 overflow-auto">
      <PageHeader title="Instellingen" description="Beheer de globale applicatie-instellingen." />
      
      <div className="max-w-4xl space-y-6 mt-6">
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-white overflow-hidden">
          <CardHeader className="bg-slate-900 text-white p-8 shrink-0">
            <div className="flex items-center gap-4">
              <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
                <Layout className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight text-white leading-none mb-1">Dashboard Banner</CardTitle>
                <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Configureer de Hero-sectie op de hoofdpagina.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            <div className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 shadow-inner">
              <div className="space-y-1">
                <Label className="text-sm font-black uppercase text-slate-900 tracking-tight">Banner Activeren</Label>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Toon of verberg de banner op het dashboard.</p>
              </div>
              <Switch 
                checked={formData.active} 
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, active: checked }))} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Titel van de Banner</Label>
                <Input 
                  value={formData.title} 
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Bv. Welkom bij BeheerHub"
                  className="h-12 font-bold rounded-xl border-slate-200 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Badge Tekst (Status)</Label>
                <Input 
                  value={formData.badgeText} 
                  onChange={e => setFormData(prev => ({ ...prev, badgeText: e.target.value }))}
                  placeholder="Bv. Operationeel: OK"
                  className="h-12 font-bold rounded-xl border-slate-200 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Omschrijving / Ondertitel</Label>
              <Textarea 
                value={formData.description} 
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Geef een korte toelichting voor op het dashboard..."
                className="min-h-[120px] font-medium leading-relaxed rounded-xl border-slate-200 focus:ring-primary/20 resize-none"
              />
            </div>

            <div className="space-y-4">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Achtergrondafbeelding</Label>
              <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="flex-1 space-y-2 w-full">
                  <div className="flex gap-2">
                    <Input 
                      value={formData.imageUrl} 
                      onChange={e => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="h-12 font-mono text-xs rounded-xl border-slate-200 focus:ring-primary/20"
                    />
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      accept="image/*" 
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="h-12 px-4 rounded-xl border-slate-200 gap-2 font-bold"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                      Upload
                    </Button>
                  </div>
                  {isUploading && uploadProgress !== null && (
                    <div className="space-y-1">
                      <Progress value={uploadProgress} className="h-1" />
                      <p className="text-[9px] font-black uppercase text-primary text-right">{Math.round(uploadProgress)}% geüpload</p>
                    </div>
                  )}
                </div>
                <div className={cn(
                  "h-24 w-40 rounded-2xl shrink-0 border-2 overflow-hidden bg-slate-50 flex items-center justify-center shadow-inner",
                  formData.imageUrl ? "border-primary/20" : "border-slate-100"
                )}>
                  {formData.imageUrl ? (
                    <img src={formData.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-slate-200" />
                  )}
                </div>
              </div>
              <p className="text-[9px] font-bold text-slate-400 italic">Tip: Upload een eigen foto of gebruik een URL van Unsplash.</p>
            </div>

            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <Button onClick={handleSave} disabled={isSaving || isUploading} className="h-12 px-12 font-black uppercase tracking-tight shadow-xl shadow-primary/20 rounded-xl">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Instellingen Opslaan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
