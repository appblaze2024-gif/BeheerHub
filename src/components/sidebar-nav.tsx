"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Users,
  ClipboardList,
  FileText,
  CalendarCheck,
  Truck,
  Wrench,
  Building2,
  Route,
  Package,
  Bell,
  Home,
  Newspaper,
  User,
  Settings,
  LogOut,
} from "lucide-react";

const menuItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/projects", label: "Projecten", icon: ClipboardList },
  { href: "/employees", label: "Medewerkers", icon: Users },
  { href: "/work-planning", label: "Werkplanning", icon: CalendarCheck },
  { href: "/weekly-reports", label: "Weekstaten", icon: Newspaper },
  { href: "/reports", label: "Rapportages", icon: FileText },
  { href: "/vehicles", label: "Voertuigen", icon: Truck },
  { href: "/machine-management", label: "Machinebeheer", icon: Wrench },
  { href: "/objects", label: "Objecten", icon: Building2 },
  { href: "/routes", label: "Routes", icon: Route },
  { href: "/inventory", label: "Voorraadbeheer", icon: Package },
  { href: "/issues", label: "Meldingen", icon: Bell },
];

const bottomMenuItems = [
  { href: "/profile", label: "Profiel", icon: User },
  { href: "/settings", label: "Instellingen", icon: Settings },
  { href: "/logout", label: "Uitloggen", icon: LogOut },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <SidebarContent>
      <SidebarMenu>
        {menuItems.map((item) => (
          <SidebarMenuItem key={item.label}>
            <Link href={item.href}>
              <SidebarMenuButton
                isActive={pathname === item.href}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>

      <SidebarMenu className="mt-auto">
        {bottomMenuItems.map((item) => (
          <SidebarMenuItem key={item.label}>
            <Link href={item.href}>
              <SidebarMenuButton
                isActive={pathname === item.href}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarContent>
  );
}
