"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "./actions";
import { banUser, changeRole, resetPassword, unbanUser } from "./actions";
import type { UserRow } from "./data";

export function UserRowActions({ user }: { user: UserRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
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
      <Dialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>Reset password</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset {user.name}&apos;s password?</DialogTitle>
            <DialogDescription>Their current password stops working and they are signed out everywhere. A temporary password appears on this page; they choose their own the next time they sign in.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setConfirmingReset(false);
                act(() => resetPassword({ userId: user.id }));
              }}
            >
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => act(() => (user.banned ? unbanUser : banUser)({ userId: user.id }))}>
        {user.banned ? "Unban" : "Ban"}
      </Button>
      {error && <p className="w-full text-right text-sm text-destructive">{error}</p>}
    </div>
  );
}
