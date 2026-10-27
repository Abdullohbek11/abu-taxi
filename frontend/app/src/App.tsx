import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Spinner } from './components/ui';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';

// Kabinetlar alohida yuklanadi — landing tez ochilishi uchun
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Search = lazy(() => import('./pages/Search'));
const TripDetail = lazy(() => import('./pages/TripDetail'));
const MyTrips = lazy(() => import('./pages/MyTrips'));
const Profile = lazy(() => import('./pages/Profile'));
const DriverHome = lazy(() => import('./pages/driver/DriverHome'));
const DriverTripManage = lazy(() => import('./pages/driver/DriverTripManage'));
const DriverCargo = lazy(() => import('./pages/driver/DriverCargo'));
const DriverTariff = lazy(() => import('./pages/driver/DriverTariff'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const CargoNew = lazy(() => import('./pages/cargo/CargoNew'));
const CargoMy = lazy(() => import('./pages/cargo/CargoMy'));

export function App() {
  return (
    <Suspense fallback={<Spinner center />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="search" element={<Search />} />
          <Route path="trips/:id" element={<TripDetail />} />
          <Route path="onboarding" element={<RequireAuth allowNoRole><Onboarding /></RequireAuth>} />
          <Route path="my-trips" element={<RequireAuth><MyTrips /></RequireAuth>} />
          <Route path="profile" element={<RequireAuth allowNoRole><Profile /></RequireAuth>} />
          <Route path="driver" element={<RequireAuth><DriverHome /></RequireAuth>} />
          <Route path="driver/trips/:id" element={<RequireAuth roles={['DRIVER']}><DriverTripManage /></RequireAuth>} />
          <Route path="driver/cargo" element={<RequireAuth roles={['DRIVER']}><DriverCargo /></RequireAuth>} />
          <Route path="driver/tariff" element={<RequireAuth roles={['DRIVER']}><DriverTariff /></RequireAuth>} />
          <Route path="cargo/new" element={<RequireAuth><CargoNew /></RequireAuth>} />
          <Route path="cargo/my" element={<RequireAuth><CargoMy /></RequireAuth>} />
          <Route path="admin/login" element={<AdminLogin />} />
          <Route path="admin" element={<RequireAuth roles={['ADMIN']}><Admin /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
