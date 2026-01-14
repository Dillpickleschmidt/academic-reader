import { RemoveFormatting } from "lucide-react"
import { SidebarMenuButton } from "@repo/core/ui/primitives/sidebar"
import { useTypographyStyle } from "@/hooks/use-typography-style"

export function TypographyStyleToggle() {
  const [style, setStyle] = useTypographyStyle()
  const isModern = style === "modern"

  return (
    <SidebarMenuButton
      onClick={() => setStyle(isModern ? "classic" : "modern")}
      tooltip="Modern Typography"
      data-active={isModern}
      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
    >
      <RemoveFormatting />
      <span>Modern Typography</span>
    </SidebarMenuButton>
  )
}
