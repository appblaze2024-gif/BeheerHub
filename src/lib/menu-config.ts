import {
  Users,
  ClipboardList,
  FileText,
  CalendarCheck,
  Truck,
  Map,
  Package,
  Bell,
  Home,
  Newspaper,
  Mail,
  FileCheck,
  Trash2,
} from 'lucide-react';
import { ElementType, SVGProps, createElement } from 'react';

// Using an inline SVG for the playground icon as requested, since it's not in lucide-react.
function PlaygroundIcon(props: SVGProps<SVGSVGElement>) {
  return createElement('svg', {
    xmlns: "http://www.w3.org/2000/svg",
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props
  }, 
    createElement('path', { d: "M2 3h2", key: 1 }),
    createElement('path', { d: "M20 3h2", key: 2 }),
    createElement('path', { d: "M6 3v1", key: 3 }),
    createElement('path', { d: "M10 3v1", key: 4 }),
    createElement('path', { d: "M14 3v1", key: 5 }),
    createElement('path', { d: "M18 3v1", key: 6 }),
    createElement('path', { d: "M4 22V6.1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2.8", key: 7 }),
    createElement('path', { d: "M12 11.9V22", key: 8 }),
    createElement('path', { d: "m6 12 6-6", key: 9 }),
    createElement('path', { d: "M6 18h12", key: 10 }),
    createElement('path', { d: "M18 10c0-1.1-.9-2-2-2h-2c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2c1.1 0 2-.9 2-2v-2z", key: 11 })
  );
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
    { href: '/prullenbakken', label: 'Prullenbakken', icon: Trash2, module: 'prullenbakken', color: 'bg-muted hover:bg-accent' },
    { href: '/inventory', label: 'Voorraadbeheer', icon: Package, module: 'inventory', color: 'bg-muted hover:bg-accent' },
    { href: '/issues', label: 'Meldingen', icon: Bell, module: 'issues', color: 'bg-muted hover:bg-accent' },
    { href: '/navigation-module', label: 'Navigatiemodule', icon: Map, module: 'navigation', color: 'bg-muted hover:bg-accent' },
    { href: '/mail', label: 'Mail', icon: Mail, module: 'mail', color: 'bg-muted hover:bg-accent' },
    { href: '/spec-reports', label: 'Besteksmeldingen', icon: FileCheck, module: 'specReports', color: 'bg-muted hover:bg-accent' },
    { href: '/schouwen', label: 'Schouwen', icon: PlaygroundIcon, module: 'schouwen', color: 'bg-muted hover:bg-accent' },
];
