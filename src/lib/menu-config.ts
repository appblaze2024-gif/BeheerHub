'use client';

import {
  List,
  MapPin,
  Route,
  Users,
  Users2,
  Camera,
  Newspaper,
} from 'lucide-react';
import { ElementType } from 'react';

export interface MenuItem {
  href: string;
  label: string;
  icon: ElementType;
  module?: string;
}

export const allMenuItems: MenuItem[] = [
    { href: '/work-planning', label: 'Werklijsten', icon: List, module: 'workPlanning' },
    { href: '/objects', label: 'Locaties', icon: MapPin, module: 'objects' },
    { href: '/navigation-module', label: 'Routes', icon: Route, module: 'navigation' },
    { href: '/employees', label: 'Gebruikers', icon: Users, module: 'employees' },
    { href: '/teams', label: 'Teams', icon: Users2, module: 'teams' },
    { href: '/photo-review', label: 'Foto beoordeling', icon: Camera, module: 'photo-review' },
    { href: '/news', label: 'Nieuws berichten', icon: Newspaper, module: 'news' },
];
