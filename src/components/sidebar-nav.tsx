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
} from "lucide-react";

const menuItems = [
  { href: "#", label: "Users", icon: Users },
  { href: "#", label: "Projects", icon: ClipboardList },
  { href: "#", label: "Reports", icon: FileText },
  { href: "#", label: "Health", icon: HeartPulse },
  { href: "#", label: "Tools", icon: Wrench },
  { href: "#", label: "Location", icon: MapPin },
  { href: "#", label: "Routes", icon: Route },
  { href: "#", label: "Notifications", icon: Bell },
  { href: "#", label: "Messages", icon: MessageSquare },
  { href: "#", label: "Camera", icon: Camera },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <SidebarContent className="pt-4">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltip={item.label}
                  asChild
                >
                  <a>
                    <item.icon />
                    <span className="sr-only">{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
