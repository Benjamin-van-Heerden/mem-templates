"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "./actions";
import { banUser, changeRole, unbanUser } from "./actions";
import type { UserRow } from "./data";

export function UserRowActions({ user }: { user: UserRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select value={user.role} onValueChange={(role) => act(() => changeRole({ userId: user.id, role }))} disabled={pending}>
        <SelectTrigger size="sm" aria-label={`Role of ${user.name}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="member">Member</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => act(() => (user.banned ? unbanUser : banUser)({ userId: user.id }))}>
        {user.banned ? "Unban" : "Ban"}
      </Button>
      {error && <p className="w-full text-right text-sm text-destructive">{error}</p>}
    </div>
  );
}
