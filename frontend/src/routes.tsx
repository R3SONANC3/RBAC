import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './lib/protected-route';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';
import { RolesPage } from './pages/RolesPage';

const Placeholder = ({ name }: { name: string }) => <div className="p-6">{name} page</div>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Placeholder name="Dashboard" /> },
      { path: '/users', element: <UsersPage /> },
      { path: '/roles', element: <RolesPage /> },
      { path: '/permissions', element: <Placeholder name="Permissions" /> },
      { path: '/audit-log', element: <Placeholder name="Audit Log" /> },
    ],
  },
]);
