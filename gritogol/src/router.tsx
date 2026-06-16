import { createBrowserRouter } from "react-router-dom";
import AppPage from "./pages/AppPage";
import EstadoVideoPage from "./pages/EstadoVideoPage";
import GanadoresPage from "./pages/GanadoresPage";
import AdminPage from "./pages/AdminPage";
import NotFoundPage from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/", element: <AppPage /> },
  { path: "/impacto", element: <AppPage /> },
  { path: "/perfil", element: <AppPage /> },
  { path: "/estado/:id", element: <EstadoVideoPage /> },
  { path: "/ganadores", element: <GanadoresPage /> },
  { path: "/admin", element: <AdminPage /> },
  { path: "*", element: <NotFoundPage /> },
]);
