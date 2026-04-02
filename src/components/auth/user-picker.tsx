"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { api } from "~/lib/api";
import type { User } from "~/types";

interface UserPickerProps {
  onSelect: (userId: string) => void;
}

export function UserPicker({ onSelect }: UserPickerProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<User[]>("/users")
      .then((res) => setUsers(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome to Onboarding Bot</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select your profile to get started
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No users configured. Please seed users via the admin API.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="h-auto w-full justify-start gap-3 px-4 py-3"
                  onClick={() => onSelect(user.id)}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-medium">{user.name}</span>
                    <Badge variant="secondary" className="mt-0.5 text-xs">
                      {user.role === "engineer" ? "Engineer" : "Business Analyst"}
                    </Badge>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
