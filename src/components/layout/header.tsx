"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { MessageSquare, Settings, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-6">
        <Link href="/chat" className="text-sm font-semibold">
          Onboarding Bot
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/chat">
            <Button
              variant={pathname?.startsWith("/chat") ? "secondary" : "ghost"}
              size="sm"
              className={cn("gap-1.5 text-xs")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </Button>
          </Link>
          <Link href="/admin">
            <Button
              variant={pathname?.startsWith("/admin") ? "secondary" : "ghost"}
              size="sm"
              className={cn("gap-1.5 text-xs")}
            >
              <Settings className="h-3.5 w-3.5" />
              Admin
            </Button>
          </Link>
        </nav>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>
    </header>
  );
}
