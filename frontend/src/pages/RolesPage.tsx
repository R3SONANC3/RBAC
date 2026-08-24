import { useEffect, useState } from 'react';
import { apiFetch, apiJson } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Permission = { id: string; resource: string; action: string };
type Role = { id: string; name: string; description: string | null; permissions: Permission[] };

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Role | null>(null);

  async function reload() {
    try {
      const [roles, permissions] = await Promise.all([
        apiJson<Role[]>('/roles'),
        apiJson<Permission[]>('/permissions'),
      ]);
      setRoles(roles);
      setPermissions(permissions);
    } catch {
      window.location.href = '/login';
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function createRole() {
    if (!newName.trim()) return;
    await apiFetch('/roles', { method: 'POST', body: JSON.stringify({ name: newName }) });
    setNewName('');
    await reload();
  }

  async function deleteRole(role: Role) {
    await apiFetch(`/roles/${role.id}`, { method: 'DELETE' });
    await reload();
  }

  async function togglePermission(role: Role, permission: Permission) {
    const has = role.permissions.some((p) => p.id === permission.id);
    await apiFetch(`/roles/${role.id}/permissions/${permission.id}`, { method: has ? 'DELETE' : 'POST' });
    await reload();
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Roles</h1>
      <div className="flex gap-2">
        <Input placeholder="New role name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button onClick={createRole}>Create</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>{role.name}</TableCell>
              <TableCell>
                {role.permissions.map((p) => `${p.resource}:${p.action}`).join(', ') || '—'}
              </TableCell>
              <TableCell className="flex gap-2">
                <Dialog open={editing?.id === role.id} onOpenChange={(open) => setEditing(open ? role : null)}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">Assign permissions</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Permissions for {role.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      {permissions.map((permission) => (
                        <label key={permission.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={role.permissions.some((p) => p.id === permission.id)}
                            onChange={() => togglePermission(role, permission)}
                          />
                          {permission.resource}:{permission.action}
                        </label>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="destructive" size="sm" onClick={() => deleteRole(role)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
