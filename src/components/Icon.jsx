export function Icon({ name, size = 24 }) {
  const paths = {
    upload: <><path d="M12 16V4"/><path d="m8 8 4-4 4 4"/><path d="M4 20v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/></>,
    swap: <><path d="M7 7h11l-3-3"/><path d="m15 17-3 3H5"/><path d="M18 7v4"/><path d="M5 17v-4"/></>,
    close: <><path d="m18 6-12 12"/><path d="m6 6 12 12"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    delete: <><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
  };
  return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
