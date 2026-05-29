import { Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login.js';
import { Dashboard } from './pages/Dashboard.js';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}
