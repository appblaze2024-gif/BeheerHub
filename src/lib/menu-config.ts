'use client';

import {
  Users,
  ClipboardList,
  FileText,
  CalendarCheck,
  Truck,
  Package,
  Bell,
  Home,
  Newspaper,
  Mail,
  FileCheck,
  MapPin,
  ClipboardCheck,
} from 'lucide-react';
import { ElementType, createElement } from 'react';
import Image from 'next/image';

// Custom icon for "Navigatiemodule"
function NavigatieIcon(props: { className?: string }) {
  return createElement(Image, {
    src: "https://i.ibb.co/Mxv40YCG/navigation-592248.png",
    alt: "Navigatie Icoon",
    width: 48,
    height: 48,
    ...props
  });
}


export interface MenuItem {
  href: string;
  label: string;
  icon: ElementType;
  module?: string;
  color: string;
}

export const allMenuItems: MenuItem[] = [
    { href: '/', label: 'Dashboard', icon: Home, color: 'bg-muted hover:bg-accent' },
    { href: '/projects', label: 'Projecten', icon: ClipboardList, module: 'projects', color: 'bg-muted hover:bg-accent' },
    { href: '/employees', label: 'Medewerkers', icon: Users, module: 'employees', color: 'bg-muted hover:bg-accent' },
    { href: '/work-planning', label: 'Werkplanning', icon: CalendarCheck, module: 'workPlanning', color: 'bg-muted hover:bg-accent' },
    { href: '/weekly-reports', label: 'Weekstaten', icon: Newspaper, module: 'weeklyReports', color: 'bg-muted hover:bg-accent' },
    { href: '/reports', label: 'Rapportages', icon: FileText, module: 'reports', color: 'bg-muted hover:bg-accent' },
    { href: '/vehicles', label: 'Wagenpark', icon: Truck, module: 'vehicles', color: 'bg-muted hover:bg-accent' },
    { href: '/objects', label: 'Objecten', icon: MapPin, module: 'objects', color: 'bg-muted hover:bg-accent' },
    { href: '/inventory', label: 'Voorraadbeheer', icon: Package, module: 'inventory', color: 'bg-muted hover:bg-accent' },
    { href: '/issues', label: 'Meldingen', icon: Bell, module: 'issues', color: 'bg-muted hover:bg-accent' },
    { href: '/navigation-module', label: 'Navigatiemodule', icon: NavigatieIcon, module: 'navigation', color: 'bg-muted hover:bg-accent' },
    { href: '/mail', label: 'Mail', icon: Mail, module: 'mail', color: 'bg-muted hover:bg-accent' },
    { href: '/spec-reports', label: 'Besteksmeldingen', icon: FileCheck, module: 'specReports', color: 'bg-muted hover:bg-accent' },
];
