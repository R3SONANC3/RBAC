import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Permission = { id: string; resource: string; action: string };

export function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await apiFetch('/permissions');
    setPermissions(await res.json());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function create() {
    setError(null);
    if (!resource.trim() || !action.trim()) return;
    const res = await apiFetch('/permissions', { method: 'POST', body: JSON.stringify({ resource, action }) });
    if (!res.ok) {
      setError('That resource:action already exists');
      return;
    }
    setResource('');
    setAction('');
    await reload();
  }

  async function remove(permission: Permission) {
    await apiFetch(`/permissions/${permission.id}`, { method: 'DELETE' });
    await reload();
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Permissions</h1>
      <div className="flex gap-2">
        <Input placeholder="resource (e.g. post)" value={resource} onChange={(e) => setResource(e.target.value)} />
        <Input placeholder="action (e.g. delete)" value={action} onChange={(e) => setAction(e.target.value)} />
        <Button onClick={create}>Create</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Resource</TableHead>
            <TableHead>Action</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((permission) => (
            <TableRow key={permission.id}>
              <TableCell>{permission.resource}</TableCell>
              <TableCell>{permission.action}</TableCell>
              <TableCell>
                <Button variant="destructive" size="sm" onClick={() => remove(permission)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
