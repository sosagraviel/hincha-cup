import { createBrowserRouter } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CamaraPage from "./pages/CamaraPage";
import EstadoVideoPage from "./pages/EstadoVideoPage";
import TribunaPage from "./pages/TribunaPage";
import GanadoresPage from "./pages/GanadoresPage";
import AdminPage from "./pages/AdminPage";
import NotFoundPage from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/camara", element: <CamaraPage /> },
  { path: "/estado/:id", element: <EstadoVideoPage /> },
  { path: "/tribuna", element: <TribunaPage /> },
  { path: "/ganadores", element: <GanadoresPage /> },
  { path: "/admin", element: <AdminPage /> },
  { path: "*", element: <NotFoundPage /> },
]);
