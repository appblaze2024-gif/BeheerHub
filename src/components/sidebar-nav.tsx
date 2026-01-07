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
  { href: "/users", label: "Users", icon: Users },
  { href: "/projects", label: "Projects", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/health", label: "Health", icon: HeartPulse },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/location", label: "Location", icon: MapPin },
  { href: "/routes", label: "Routes", icon: Route },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/camera", label: "Camera", icon: Camera },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <SidebarContent className="pt-4">
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
