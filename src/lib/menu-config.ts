'use client';

import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  Users,
  Folder,
  Truck,
  FileText,
  Warehouse,
  Bell,
  Navigation,
  Mail,
  Settings,
  User,
  FileWarning,
  Cpu,
} from 'lucide-react';
import { ElementType } from 'react';

export interface SubMenuItem {
    href: string;
    label: string;
    id: string;
}

export interface MenuItem {
  href: string;
  label: string;
  icon: ElementType;
  module?: string;
  subItems?: SubMenuItem[];
}

export const allMenuItems: MenuItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { 
      href: '/projects', 
      label: 'Projecten', 
      icon: Folder, 
      module: 'projects',
      subItems: [
        { href: '/projects', label: 'Projectbeheer', id: 'project' },
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
        { href: '/work-planning', label: 'Werkplanning', id: 'work-planning' },
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
        { href: '/issues', label: 'Werkbonnen', id: 'werkbonnen' },
        { href: '/issues/open', label: 'Openstaand', id: 'open' },
        { href: '/issues/portal', label: 'Portaal', id: 'portal' },
        { href: '/issues/archive', label: 'Archief', id: 'archive' },
      ]
    },
    { href: '/objects', label: 'Objecten', icon: MapPin, module: 'objects' },
    { href: '/spec-reports', label: 'Bestek', icon: FileWarning, module: 'specReports' },
    { href: '/navigation-module', label: 'Navigatie', icon: Navigation, module: 'navigation' },
    { href: '/iot', label: 'IoT', icon: Cpu, module: 'iot' },
    { href: '/mail', label: 'Mail', icon: Mail, module: 'mail' },
    { href: '/profile', label: 'Mijn Profiel', icon: User, module: 'users' },
    { href: '/settings', label: 'Instellingen', icon: Settings },
];
