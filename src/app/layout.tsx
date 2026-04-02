import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Header } from "~/components/layout/header";
import { UserGate } from "~/components/auth/user-gate";

export const metadata: Metadata = {
  title: "Onboarding Chatbot",
  description: "AI-powered repository onboarding assistant",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <UserGate>
              <Header />
              <main>{children}</main>
            </UserGate>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
