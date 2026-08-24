import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './lib/protected-route';
import { Layout } from './lib/layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { RolesPage } from './pages/RolesPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { AuditLogPage } from './pages/AuditLogPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/users', element: <UsersPage /> },
          { path: '/roles', element: <RolesPage /> },
          { path: '/permissions', element: <PermissionsPage /> },
          { path: '/audit-log', element: <AuditLogPage /> },
        ],
      },
    ],
  },
]);
