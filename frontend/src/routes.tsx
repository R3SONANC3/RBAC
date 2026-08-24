import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './lib/protected-route';

const Placeholder = ({ name }: { name: string }) => <div className="p-6">{name} page</div>;

export const router = createBrowserRouter([
  { path: '/login', element: <Placeholder name="Login" /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Placeholder name="Dashboard" /> },
      { path: '/users', element: <Placeholder name="Users" /> },
      { path: '/roles', element: <Placeholder name="Roles" /> },
      { path: '/permissions', element: <Placeholder name="Permissions" /> },
      { path: '/audit-log', element: <Placeholder name="Audit Log" /> },
    ],
  },
]);
