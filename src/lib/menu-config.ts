'use client';

import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  Users,
  Folder,
  Truck,
  Bell,
  Navigation,
  Mail,
  User,
  FileWarning,
  Cpu,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { ElementType } from 'react';

export interface SubMenuItem {
    href: string;
    label: string;
    id: string;
    module?: string; // Optioneel: als het sub-item naar een andere module verwijst (bv. Werkplanning)
}

export interface MenuItem {
  href: string;
  label: string;
  icon: ElementType;
  module?: string;
  subItems?: SubMenuItem[];
}

/**
 * Centrale configuratie voor de navigatie van BeheerHub.
 */
export const allMenuItems: MenuItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { 
      href: '/projects', 
      label: 'Projecten', 
      icon: Folder, 
      module: 'projects',
      subItems: [
        { href: '/projects', label: 'Projectbeheer', id: 'project' },
        { href: '/annual-planning', label: 'Jaarplanning', id: 'annual-planning' },
        { href: '/bestanden', label: 'Documenten', id: 'bestanden' },
      ]
    },
    { 
      href: '/employees', 
      label: 'Personeel', 
      icon: Users, 
      module: 'employees',
      subItems: [
        { href: '/employees', label: 'Medewerkers', id: 'overzicht' },
        { href: '/work-planning', label: 'Werkplanning', id: 'work-planning', module: 'workPlanning' },
      ]
    },
    { 
      href: '/vehicles', 
      label: 'Wagenpark', 
      icon: Truck, 
      module: 'vehicles',
    },
    { 
      href: '/weekly-reports', 
      label: 'Weekstaten', 
      icon: ClipboardList, 
      module: 'weeklyReports' 
    },
    { 
      href: '/issues', 
      label: 'Meldingen', 
      icon: Bell, 
      module: 'issues',
      subItems: [
        { href: '/navigation-module?type=meldingen', label: 'Werkbonnen', id: 'werkbonnen' },
        { href: '/issues/open', label: 'Openstaand', id: 'open' },
        { href: '/issues/new', label: 'Melding maken', id: 'new' },
        { href: '/issues/portal', label: 'Portaal', id: 'portal' },
        { href: '/issues/archive', label: 'Archief', id: 'archive' },
      ]
    },
    { 
      href: '/objects', 
      label: 'Objecten', 
      icon: MapPin, 
      module: 'objects',
      subItems: [
        { href: '/objects', label: 'Overzicht', id: 'overzicht' },
        { href: '/objects?action=import', label: 'Import', id: 'import' },
        { href: '/objects?action=export', label: 'Export', id: 'export' },
      ]
    },
    { 
      href: '/gis-data', 
      label: 'GIS-data', 
      icon: Layers, 
      module: 'gisData' 
    },
    { href: '/spec-reports', label: 'Bestek', icon: FileWarning, module: 'specReports' },
    { 
      href: '/navigation-module', 
      label: 'Navigatie', 
      icon: Navigation, 
      module: 'navigation',
      subItems: [
        { href: '/navigation-module?type=veegroutes', label: 'Veegroutes', id: 'veegroutes' },
        { href: '/navigation-module?type=prullenbakken', label: 'Prullenbakken', id: 'prullenbakken' },
        { href: '/navigation-module/history', label: 'Historie', id: 'history' },
        { href: '/navigation-module/assignment', label: 'Toewijzen', id: 'assignment' },
      ]
    },
    { href: '/iot', label: 'Internet of Things', icon: Cpu, module: 'iot' },
    { href: '/mail', label: 'Mail', icon: Mail, module: 'mail' },
    { href: '/users', label: 'Gebruikers', icon: ShieldCheck, module: 'users' },
    { href: '/profile', label: 'Mijn Profiel', icon: User },
];
