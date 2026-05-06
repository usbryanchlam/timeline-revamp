import { createBrowserRouter, RouterProvider } from 'react-router';
import { PublicReelRoute } from '@/routes/PublicReelRoute';
import { HandleReelRoute } from '@/routes/HandleReelRoute';
import { AppLayout } from '@/routes/AppLayout';
import { AppReelRoute } from '@/routes/AppReelRoute';
import { TripsRoute } from '@/routes/TripsRoute';
import { MeRoute } from '@/routes/MeRoute';
import { NotFoundRoute } from '@/routes/NotFoundRoute';

const router = createBrowserRouter([
  { path: '/', element: <PublicReelRoute /> },
  { path: '/u/:handle', element: <HandleReelRoute /> },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <AppReelRoute /> },
      { path: 'trips', element: <TripsRoute /> },
      { path: 'me', element: <MeRoute /> },
    ],
  },
  { path: '*', element: <NotFoundRoute /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
