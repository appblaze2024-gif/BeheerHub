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
} from 'lucide-react';
import type { ElementType } from 'react';

export interface MenuItem {
  href: string;
  label: string;
  icon: ElementType;
  module?: string;
}

export const allMenuItems: MenuItem[] = [
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/projects', label: 'Projecten', icon: ClipboardList, module: 'projects' },
    { href: '/employees', label: 'Medewerkers', icon: Users, module: 'employees' },
    { href: '/work-planning', label: 'Werkplanning', icon: CalendarCheck, module: 'workPlanning' },
    { href: '/weekly-reports', label: 'Weekstaten', icon: Newspaper, module: 'weeklyReports' },
    { href: '/reports', label: 'Rapportages', icon: FileText, module: 'reports' },
    { href: '/vehicles', label: 'Wagenpark', icon: Truck, module: 'vehicles' },
    { href: '/objects', label: 'Objecten', icon: Building2, module: 'objects' },
    { href: '/inventory', label: 'Voorraadbeheer', icon: Package, module: 'inventory' },
    { href: '/issues', label: 'Meldingen', icon: Bell, module: 'issues' },
    { href: '/navigation-module', label: 'Navigatiemodule', icon: Map, module: 'navigation' },
    { href: '/mail', label: 'Mail', icon: Mail, module: 'mail' },
];
