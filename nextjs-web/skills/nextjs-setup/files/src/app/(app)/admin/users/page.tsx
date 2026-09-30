import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUserForm } from "@/features/users/create-user-form";
import { getUsers } from "@/features/users/data";
import { UserRowActions } from "@/features/users/user-row-actions";

export const metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <div className="grid gap-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading users…</p>}>
        <Users />
      </Suspense>
    </div>
  );
}

async function Users() {
  const users = await getUsers();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>Sign-up is closed; accounts are created here. Share the initial password with the user.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="hidden sm:table-cell">Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.banned && <Badge variant="destructive" className="ml-2">Banned</Badge>}
                    <div className="mt-1 sm:hidden"><RoleBadge role={u.role} /></div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{u.email}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell className="text-right">
                    {u.role === "super_admin" ? <span className="text-sm whitespace-normal text-muted-foreground">Set by environment</span> : <UserRowActions user={u} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function RoleBadge({ role }: { role: string }) {
  return <Badge variant={role === "super_admin" ? "default" : "secondary"}>{role.replace("_", " ")}</Badge>;
}
