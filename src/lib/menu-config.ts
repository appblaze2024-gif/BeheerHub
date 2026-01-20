import {
  Users,
  ClipboardList,
  FileText,
  CalendarCheck,
  Truck,
  Building2,
  Map,
  Package,
  Bell,
  Home,
  Newspaper,
  Mail,
  FileCheck,
} from 'lucide-react';
import type { ElementType } from 'react';

export interface MenuItem {
  href: string;
  label: string;
  icon: ElementType;
  module?: string;
  color: string;
}

export const allMenuItems: MenuItem[] = [
    { href: '/', label: 'Dashboard', icon: Home, color: 'bg-teal-600 hover:bg-teal-700' },
    { href: '/projects', label: 'Projecten', icon: ClipboardList, module: 'projects', color: 'bg-sky-600 hover:bg-sky-700' },
    { href: '/employees', label: 'Medewerkers', icon: Users, module: 'employees', color: 'bg-rose-600 hover:bg-rose-700' },
    { href: '/work-planning', label: 'Werkplanning', icon: CalendarCheck, module: 'workPlanning', color: 'bg-amber-600 hover:bg-amber-700' },
    { href: '/weekly-reports', label: 'Weekstaten', icon: Newspaper, module: 'weeklyReports', color: 'bg-indigo-600 hover:bg-indigo-700' },
    { href: '/reports', label: 'Rapportages', icon: FileText, module: 'reports', color: 'bg-emerald-600 hover:bg-emerald-700' },
    { href: '/vehicles', label: 'Wagenpark', icon: Truck, module: 'vehicles', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { href: '/objects', label: 'Objecten', icon: Building2, module: 'objects', color: 'bg-fuchsia-600 hover:bg-fuchsia-700' },
    { href: '/inventory', label: 'Voorraadbeheer', icon: Package, module: 'inventory', color: 'bg-slate-600 hover:bg-slate-700' },
    { href: '/issues', label: 'Meldingen', icon: Bell, module: 'issues', color: 'bg-lime-600 hover:bg-lime-700' },
    { href: '/navigation-module', label: 'Navigatiemodule', icon: Map, module: 'navigation', color: 'bg-orange-600 hover:bg-orange-700' },
    { href: '/mail', label: 'Mail', icon: Mail, module: 'mail', color: 'bg-violet-600 hover:bg-violet-700' },
    { href: '/spec-reports', label: 'Besteksmeldingen', icon: FileCheck, module: 'specReports', color: 'bg-teal-600 hover:bg-teal-700' },
];
