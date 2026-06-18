import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import DailySchedulePage from './pages/DailySchedulePage';
import WeeklyTemplatesPage from './pages/WeeklyTemplatesPage';
import MySchedulePage from './pages/MySchedulePage';
import AddEventPage from './pages/AddEventPage';
import RequestTimeOffPage from './pages/RequestTimeOffPage';
import CalendarPage from './pages/CalendarPage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import NotFoundPage from './pages/NotFoundPage';
import ShiftRequestPage from './pages/ShiftRequestPage';
import NotificationsPage from './pages/NotificationsPage';
import AvailabilityPage from './pages/AvailabilityPage';
import { ProtectedRoute } from './components/ProtectedRoute';

export const router = createBrowserRouter([
  { path: '/login',           element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  {
    path: '/',
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true,         element: <ProtectedRoute managerOnly><DailySchedulePage /></ProtectedRoute> },
      { path: 'templates',   element: <ProtectedRoute managerOnly><WeeklyTemplatesPage /></ProtectedRoute> },
      { path: 'my-schedule', element: <MySchedulePage /> },
      { path: 'add-event',        element: <ProtectedRoute managerOnly><AddEventPage /></ProtectedRoute> },
      { path: 'calendar',         element: <CalendarPage /> },
      { path: 'request-time-off', element: <RequestTimeOffPage /> },
      { path: 'shift-requests',   element: <ShiftRequestPage /> },
      { path: 'availability',     element: <AvailabilityPage /> },
      { path: 'notifications',    element: <NotificationsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
