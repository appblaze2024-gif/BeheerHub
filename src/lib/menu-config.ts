'use client';

import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  Users,
  Users2,
  Newspaper,
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
    { href: '/projects', label: 'Projecten', icon: Folder, module: 'projects' },
    { href: '/employees', label: 'Medewerkers', icon: Users, module: 'employees' },
    { href: '/work-planning', label: 'Werkplanning', icon: ClipboardList, module: 'workPlanning' },
    { href: '/weekly-reports', label: 'Weekstaten', icon: FileText, module: 'weeklyReports' },
    { href: '/reports', label: 'Rapporten', icon: FileText, module: 'reports' },
    { href: '/bestanden', label: 'Bestanden', icon: Folder, module: 'bestanden' },
    { href: '/vehicles', label: 'Wagenpark', icon: Truck, module: 'vehicles' },
    { href: '/objects', label: 'Objecten', icon: MapPin, module: 'objects' },
    { href: '/inventory', label: 'Voorraadbeheer', icon: Warehouse, module: 'inventory' },
    { 
      href: '/issues', 
      label: 'Meldingen', 
      icon: Bell, 
      module: 'issues',
      subItems: [
        { href: '/issues', label: 'Werkbonnen', id: 'werkbonnen' },
        { href: '/issues/open', label: 'Openstaande meldingen', id: 'open' },
        { href: '/issues/new', label: 'Melding maken', id: 'new' },
        { href: '/issues/archive', label: 'Meldingen archief', id: 'archive' },
      ]
    },
    { href: '/spec-reports', label: 'Besteksmeldingen', icon: FileWarning, module: 'specReports' },
    { href: '/navigation-module', label: 'Navigatiemodule', icon: Navigation, module: 'navigation' },
    { href: '/teams', label: 'Teams', icon: Users2, module: 'teams' },
    { href: '/mail', label: 'Mail', icon: Mail, module: 'mail' },
    { href: '/profile', label: 'Mijn Profiel', icon: User, module: 'users' },
    { href: '/settings', label: 'Instellingen', icon: Settings },
];
