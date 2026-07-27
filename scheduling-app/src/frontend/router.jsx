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
import ChangePasswordPage from './pages/ChangePasswordPage';
import NotFoundPage from './pages/NotFoundPage';
import ShiftRequestPage from './pages/ShiftRequestPage';
import NotificationsPage from './pages/NotificationsPage';
import AvailabilityPage from './pages/AvailabilityPage';
import AvailabilityManagerPage from './pages/AvailabilityManagerPage';
import ManageStaffPage from './pages/ManageStaffPage';
import WeeklyViewPage from './pages/WeeklyViewPage';
import TeamSchedulePage from './pages/TeamSchedulePage';
import { ProtectedRoute } from './components/ProtectedRoute';

export const router = createBrowserRouter([
  { path: '/login',            element: <LoginPage /> },
  { path: '/change-password',  element: <ChangePasswordPage /> },
  { path: '/forgot-password',  element: <ForgotPasswordPage /> },
  {
    path: '/',
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true,         element: <ProtectedRoute managerOnly><DailySchedulePage /></ProtectedRoute> },
      { path: 'weekly',      element: <ProtectedRoute managerOnly><WeeklyViewPage /></ProtectedRoute> },
      { path: 'templates',   element: <ProtectedRoute managerOnly><WeeklyTemplatesPage /></ProtectedRoute> },
      { path: 'my-schedule', element: <MySchedulePage /> },
      { path: 'team-schedule', element: <TeamSchedulePage /> },
      { path: 'add-event',        element: <ProtectedRoute managerOnly><AddEventPage /></ProtectedRoute> },
      { path: 'calendar',         element: <CalendarPage /> },
      // Built around the signed-in employee's own shifts — a manager has no
      // staffId, so these can't render anything meaningful for them.
      { path: 'request-time-off', element: <ProtectedRoute employeeOnly><RequestTimeOffPage /></ProtectedRoute> },
      { path: 'shift-requests',   element: <ProtectedRoute employeeOnly><ShiftRequestPage /></ProtectedRoute> },
      { path: 'availability',     element: <ProtectedRoute employeeOnly><AvailabilityPage /></ProtectedRoute> },
      { path: 'staff-availability',  element: <ProtectedRoute managerOnly><AvailabilityManagerPage /></ProtectedRoute> },
      { path: 'manage-staff',        element: <ProtectedRoute managerOnly><ManageStaffPage /></ProtectedRoute> },
      { path: 'notifications',    element: <NotificationsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
