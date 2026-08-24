import { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type AuditLog = {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
};

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [targetType, setTargetType] = useState('');

  useEffect(() => {
    const query = targetType ? `?targetType=${encodeURIComponent(targetType)}` : '';
    apiJson<AuditLog[]>(`/audit-log${query}`)
      .then(setLogs)
      .catch(() => {
        window.location.href = '/login';
      });
  }, [targetType]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <Input
        placeholder="Filter by target type (e.g. UserRole)"
        value={targetType}
        onChange={(e) => setTargetType(e.target.value)}
        className="max-w-xs"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
              <TableCell>{log.actorUserId}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>{log.targetType}:{log.targetId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
