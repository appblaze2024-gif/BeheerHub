'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Pencil,
  Paperclip,
  Plus,
  Search,
  FileText,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { doc } from 'firebase/firestore';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import type { Medewerker } from '@/lib/types';
import { MedewerkerDialog } from '@/components/medewerker-dialog';

function DetailField({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string | undefined | null;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b py-3">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || '-'}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={onEdit}>
        <Pencil className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const firestore = useFirestore();
  const id = params.id as string;
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const employeeRef = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return doc(firestore, 'medewerkers', id);
  }, [firestore, id]);

  const { data: medewerker, isLoading } = useDoc<Medewerker>(employeeRef);

  const getInitials = (firstName?: string, lastName?: string) => {
    const firstInitial = firstName?.[0] || '';
    const lastInitial = lastName?.[0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  };

  const handleEdit = () => {
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        Medewerker wordt geladen...
      </div>
    );
  }

  if (!medewerker) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p>Medewerker niet gevonden.</p>
        <Button onClick={() => router.back()} className="mt-4">
          Terug
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="p-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12">
            <AvatarImage
              src={medewerker.avatarUrl}
              alt={`${medewerker.voornaam} ${medewerker.achternaam}`}
            />
            <AvatarFallback className="text-xl">
              {getInitials(medewerker.voornaam, medewerker.achternaam)}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold">{`${medewerker.voornaam || ''} ${
            medewerker.tussenvoegsel || ''
          } ${medewerker.achternaam || ''}`.trim()}</h1>
        </div>
      </div>

      <Tabs defaultValue="overzicht" className="flex-1 px-6 pb-6 flex flex-col">
        <TabsList>
          <TabsTrigger value="overzicht">Overzicht</TabsTrigger>
          <TabsTrigger value="afwezigheid">Afwezigheid</TabsTrigger>
          <TabsTrigger value="rooster">Rooster</TabsTrigger>
          <TabsTrigger value="contracten">Contracten</TabsTrigger>
        </TabsList>
        <TabsContent value="overzicht" className="mt-6 flex-1 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Persoonsgegevens</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-12 md:grid-cols-3">
              <div>
                <DetailField label="Voornaam" value={medewerker.voornaam} onEdit={handleEdit} />
                <DetailField label="Tussenvoegsel" value={medewerker.tussenvoegsel} onEdit={handleEdit} />
                <DetailField label="Achternaam" value={medewerker.achternaam} onEdit={handleEdit} />
                <DetailField label="Geboortedatum" value={medewerker.geboortedatum} onEdit={handleEdit} />
                <DetailField label="Geboorteplaats" value={medewerker.geboorteplaats} onEdit={handleEdit} />
              </div>
              <div>
                <DetailField label="Telefoonnr." value={medewerker.telefoonnummer} onEdit={handleEdit} />
                <DetailField label="Mobiel nr." value={medewerker.mobiel} onEdit={handleEdit} />
                <DetailField label="Nood nr." value={medewerker.noodnummer} onEdit={handleEdit} />
                <DetailField label="Adres" value={medewerker.adres} onEdit={handleEdit} />
                <DetailField label="Postcode" value={medewerker.postcode} onEdit={handleEdit} />
                <DetailField label="Plaats" value={medewerker.plaats} onEdit={handleEdit} />
              </div>
              <div>
                <DetailField label="Nationaliteit" value={medewerker.nationaliteit} onEdit={handleEdit} />
                <DetailField label="BSN" value={medewerker.bsn} onEdit={handleEdit} />
                <DetailField label="ID/Paspoort nr." value={medewerker.paspoortnummer} onEdit={handleEdit} />
                <DetailField label="Bankrekening" value={medewerker.bankrekening} onEdit={handleEdit} />
                <DetailField label="Datum in dienst" value={medewerker.indiensttreding} onEdit={handleEdit} />
                <DetailField label="Personeels nr." value={medewerker.personeelsnummer} onEdit={handleEdit} />
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Persoonlijke bestanden</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-48">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Persoonlijk bestand z..." className="pl-8 h-9" />
                  </div>
                  <Button size="sm"><Plus className="h-4 w-4 mr-2" />Bestand toevoegen</Button>
                </div>
              </CardHeader>
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Paperclip className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-sm">Geen bestanden gevonden</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Persoonlijke notities</CardTitle>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Notitie toevoegen</Button>
              </CardHeader>
              <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileText className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-sm">Geen notities gevonden</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      <MedewerkerDialog 
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        medewerker={medewerker}
      />
    </div>
  );
}
