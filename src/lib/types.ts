export type Medewerker = {
  id: string;
  voornaam: string;
  tussenvoegsel?: string;
  achternaam: string;
  email?: string;
  telefoonnummer?: string;
  taal?: string;
  functie?: string;
  status: 'Actief' | 'Inactief' | 'Niet uitgenodigd';
  avatarUrl?: string;
};
