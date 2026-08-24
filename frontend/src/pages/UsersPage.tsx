import { useEffect, useState } from 'react';
import { apiFetch, apiJson } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Role = { id: string; name: string };
type User = { id: string; email: string; isActive: boolean; roles: Role[] };

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<User | null>(null);

  async function reload() {
    try {
      const [users, roles] = await Promise.all([apiJson<User[]>('/users'), apiJson<Role[]>('/roles')]);
      setUsers(users);
      setRoles(roles);
    } catch {
      // Read failed and can't be recovered client-side (e.g. refresh token
      // itself expired) — bounce to login rather than leaving a broken page.
      window.location.href = '/login';
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggleActive(user: User) {
    await apiFetch(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !user.isActive }) });
    await reload();
  }

  async function toggleRole(user: User, role: Role) {
    const has = user.roles.some((r) => r.id === role.id);
    await apiFetch(`/users/${user.id}/roles/${role.id}`, { method: has ? 'DELETE' : 'POST' });
    await reload();
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => toggleActive(user)}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Button>
              </TableCell>
              <TableCell>{user.roles.map((r) => r.name).join(', ') || '—'}</TableCell>
              <TableCell>
                <Dialog open={editing?.id === user.id} onOpenChange={(open) => setEditing(open ? user : null)}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">Assign roles</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Roles for {user.email}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      {roles.map((role) => (
                        <label key={role.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={user.roles.some((r) => r.id === role.id)}
                            onChange={() => toggleRole(user, role)}
                          />
                          {role.name}
                        </label>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
