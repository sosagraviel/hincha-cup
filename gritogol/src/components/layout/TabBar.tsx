import { NavLink } from "react-router-dom";
import s from "../../styles/app.module.css";

const tabs = [
  {
    to: "/",
    label: "Muro",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="8" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
        <rect x="13" y="13" width="8" height="8" rx="2" />
      </svg>
    ),
  },
  {
    to: "/impacto",
    label: "Impacto",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M12 21s-7.5-4.7-9.7-9C.7 8.6 2.6 5 6.1 5c2 0 3.3 1 3.9 2 .6-1 1.9-2 3.9-2 3.5 0 5.4 3.6 3.8 7-2.2 4.3-9.7 9-9.7 9z" />
      </svg>
    ),
  },
  {
    to: "/perfil",
    label: "Perfil",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6" />
      </svg>
    ),
  },
];

export function TabBar() {
  return (
    <nav className={s.tabbar} aria-label="Navegación principal">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            `${s.tabbarBtn} ${isActive ? s.tabbarBtnActive : ""}`
          }
          onClick={() => window.scrollTo(0, 0)}
        >
          {tab.icon}
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
