'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';

function FormField({
  id,
  label,
  value,
  className,
}: {
  id: string;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <Input id={id} defaultValue={value} />
    </div>
  );
}

type Werksoort = {
  id: string;
  postnummer: string;
  werksoort: string;
  eenheid: string;
  fictieveH: string;
  uurprijs: string;
};

function WerksoortenTab() {
  const [werksoorten, setWerksoorten] = React.useState<Werksoort[]>([
    {
      id: '1',
      postnummer: '00001',
      werksoort: 'veegkipper incl. chauffeur',
      eenheid: 'stuk',
      fictieveH: '1',
      uurprijs: '89,36',
    },
  ]);

  const addRow = () => {
    setWerksoorten([
      ...werksoorten,
      {
        id: new Date().toISOString(),
        postnummer: '',
        werksoort: '',
        eenheid: '',
        fictieveH: '',
        uurprijs: '',
      },
    ]);
  };

  const removeRow = (id: string) => {
    setWerksoorten(werksoorten.filter((w) => w.id !== id));
  };

  const handleInputChange = (
    id: string,
    field: keyof Werksoort,
    value: string
  ) => {
    setWerksoorten(
      werksoorten.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] gap-x-4 px-1 text-sm font-semibold">
        <Label>Postnummer</Label>
        <Label>Werksoort</Label>
        <Label>Eenheid</Label>
        <Label>Fictieve H.</Label>
        <Label>Uurprijs</Label>
        <span />
      </div>
      {werksoorten.map((werksoort) => (
        <div
          key={werksoort.id}
          className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] items-center gap-x-4"
        >
          <Input
            value={werksoort.postnummer}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'postnummer', e.target.value)
            }
          />
          <Input
            value={werksoort.werksoort}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'werksoort', e.target.value)
            }
          />
          <Input
            value={werksoort.eenheid}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'eenheid', e.target.value)
            }
          />
          <Input
            value={werksoort.fictieveH}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'fictieveH', e.target.value)
            }
          />
          <Input
            value={werksoort.uurprijs}
            onChange={(e) =>
              handleInputChange(werksoort.id, 'uurprijs', e.target.value)
            }
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeRow(werksoort.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={addRow}>
        Regel toevoegen
      </Button>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <div className="flex flex-col flex-1 pt-6 min-h-0">
      <div className='px-6'>
        <PageHeader title="Projecten" />
      </div>

      <Tabs defaultValue="project" className="flex-1 flex flex-col min-h-0 mt-6">
        <div className="px-6">
          <TabsList>
            <TabsTrigger value="project">Project</TabsTrigger>
            <TabsTrigger value="werksoorten">Werksoorten</TabsTrigger>
            <TabsTrigger value="afspraken">Afspraken</TabsTrigger>
            <TabsTrigger value="organisatie">Organisatie</TabsTrigger>
            <TabsTrigger value="bestanden">Bestanden</TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex items-center gap-4 mt-6 px-6">
          <Label htmlFor="select-project" className="font-semibold whitespace-nowrap">
            Selecteer Project:
          </Label>
          <Select defaultValue="gemeente-aalsmeer">
            <SelectTrigger className="w-full max-w-lg">
              <SelectValue placeholder="Selecteer een project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemeente-aalsmeer">
                Gemeente Aalsmeer [DVO Aalsmeer]
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent
          value="project"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <FormField
                    id="projectnummer"
                    label="Projectnummer"
                    value="2026-67502"
                  />
                  <FormField
                    id="projectnaam"
                    label="Projectnaam"
                    value="DVO Aalsmeer"
                  />
                  <FormField id="locatie" label="Locatie" value="Aalsmeer" />
                   <FormField
                    id="opdrachtgever"
                    label="Opdrachtgever"
                    value="Gemeente Aalsmeer"
                  />
                  <FormField
                    id="startdatum"
                    label="Startdatum"
                    value="01-01-2026"
                  />
                  <FormField
                    id="einddatum"
                    label="Einddatum"
                    value="31-12-2026"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bestek</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <FormField id="bestek" label="Bestek" value="Beeldbestek" />
                  <FormField
                    id="besteknummer"
                    label="Besteknummer"
                    value="U456tres"
                  />
                  <FormField id="versie" label="Versie" value="1" />
                   <FormField id="datum" label="Datum" value="01-01-2026" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Korte omschrijving werkzaamheden
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={4} />
              </CardContent>
            </Card>

            <div className="flex justify-start gap-2">
              <Button>Opslaan</Button>
              <Button variant="outline">Nieuw</Button>
              <Button variant="destructive">Verwijder</Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent
          value="werksoorten"
          className="flex-1 overflow-y-auto pt-6 pb-2 px-6"
        >
          <WerksoortenTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
