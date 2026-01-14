"use client"

import type { ReactNode } from "react"
import { type LucideIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/core/ui/primitives/sidebar"

type ActionItem =
  | {
      name: string
      icon: LucideIcon
      onClick?: () => void
      disabled?: boolean
      render?: never
    }
  | {
      render: ReactNode
      name?: never
      icon?: never
      onClick?: never
      disabled?: never
    }

export function NavActions({ actions }: { actions: ActionItem[] }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Actions</SidebarGroupLabel>
      <SidebarMenu>
        {actions.map((item, index) => {
          if ("render" in item) {
            return <SidebarMenuItem key={index}>{item.render}</SidebarMenuItem>
          }
          const Icon = item.icon
          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton
                onClick={item.onClick}
                disabled={item.disabled}
                tooltip={item.name}
              >
                <Icon />
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
