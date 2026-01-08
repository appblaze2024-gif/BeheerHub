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
  urenPerWeek?: number;
  afwezig?: {
    maandag?: boolean;
    dinsdag?: boolean;
    woensdag?: boolean;
    donderdag?: boolean;
    vrijdag?: boolean;
    zaterdag?: boolean;
    zondag?: boolean;
  },
  notities?: string;
};
