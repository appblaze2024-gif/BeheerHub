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
  HeartPulse,
  Wrench,
  MapPin,
  Route,
  Bell,
  MessageSquare,
  Camera,
  Home,
} from "lucide-react";

const menuItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/users", label: "Gebruikers", icon: Users },
  { href: "/projects", label: "Projecten", icon: ClipboardList },
  { href: "/reports", label: "Rapporten", icon: FileText },
  { href: "/health", label: "Gezondheid", icon: HeartPulse },
  { href: "/tools", label: "Gereedschap", icon: Wrench },
  { href: "/location", label: "Locatie", icon: MapPin },
  { href: "/routes", label: "Routes", icon: Route },
  { href: "/notifications", label: "Notificaties", icon: Bell },
  { href: "/messages", label: "Berichten", icon: MessageSquare },
  { href: "/camera", label: "Camera", icon: Camera },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <Link href={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <span>
                    <item.icon />
                    <span className="sr-only">{item.label}</span>
                  </span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
