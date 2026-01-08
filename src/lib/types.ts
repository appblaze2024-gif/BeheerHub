export type Medewerker = {
  id: string;
  voornaam: string;
  achternaam: string;
  email: string;
  functie?: string;
  telefoon?: string;
  mobiel?: string;
  status: 'Actief' | 'Inactief' | 'Niet uitgenodigd';
  avatarUrl?: string;
};
