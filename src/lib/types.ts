export type Medewerker = {
  id: string;
  voornaam: string;
  tussenvoegsel?: string;
  achternaam: string;
  email?: string;
  telefoonnummer?: string;
  mobiel?: string;
  taal?: string;
  functie?: string;
  status: 'Actief' | 'Inactief' | 'Niet uitgenodigd';
  avatarUrl?: string;
  soortMedewerker?: string;
  kostprijs?: number;
  verkoopprijs?: number;
  indiensttreding?: any; // Can be string, Date, or Firestore Timestamp
  uitdiensttreding?: any; // Can be string, Date, or Firestore Timestamp
  contractType?: string;
  urenPerDag?: {
    maandag?: number;
    dinsdag?: number;
    woensdag?: number;
    donderdag?: number;
    vrijdag?: number;
    zaterdag?: number;
    zondag?: number;
  };
  notities?: string;
};
