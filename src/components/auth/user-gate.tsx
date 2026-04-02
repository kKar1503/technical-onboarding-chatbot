"use client";

import { useEffect, useState } from "react";
import { UserPicker } from "./user-picker";

interface UserGateProps {
  children: React.ReactNode;
}

export function UserGate({ children }: UserGateProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("onboarding-user-id");
    setUserId(stored);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!userId) {
    return (
      <UserPicker
        onSelect={(id) => {
          localStorage.setItem("onboarding-user-id", id);
          setUserId(id);
        }}
      />
    );
  }

  return <>{children}</>;
}
