const PATHS = {
  gloves: (
    <>
      <path d="M8 11v6.5a2.5 2.5 0 0 0 5 0V14" />
      <path d="M13 11v4.5a2 2 0 0 0 4 0V12" />
      <path d="M8 11c0-2.2 1.3-4 3.2-4.6.6-.2 1.3-.2 1.9 0 1.1.4 2 1.3 2.5 2.4.2.5.4 1 .4 1.6" />
      <path d="M8.2 9.2C6.5 9.6 5.2 11 5.2 13v1.2a1.8 1.8 0 0 0 3.2 1.1" />
    </>
  ),
  bags: (
    <>
      <path d="M8 9h8l-.7 9.2a1.5 1.5 0 0 1-1.5 1.3h-3.6a1.5 1.5 0 0 1-1.5-1.3L8 9Z" />
      <path d="M10 9V7.5a2 2 0 0 1 4 0V9" />
    </>
  ),
  clean: (
    <>
      <path d="M12 4v3" />
      <path d="M9.2 5.2 11 7" />
      <path d="M14.8 5.2 13 7" />
      <path d="M10 10h4l.8 8.5a1.2 1.2 0 0 1-1.2 1.3h-3.2a1.2 1.2 0 0 1-1.2-1.3L10 10Z" />
    </>
  ),
  box: (
    <>
      <path d="M4.5 8.5 12 4.5l7.5 4-7.5 4-7.5-4Z" />
      <path d="M4.5 8.5v7l7.5 4 7.5-4v-7" />
      <path d="M12 12.5v7" />
    </>
  ),
  disposable: (
    <>
      <path d="M8 7h8v2.2l-1 9.3a1.2 1.2 0 0 1-1.2 1H10.2a1.2 1.2 0 0 1-1.2-1L8 9.2V7Z" />
      <path d="M9.5 7V6a2.5 2.5 0 0 1 5 0v1" />
      <path d="M10 12h4" />
    </>
  ),
  office: (
    <>
      <path d="M7 6.5h10v11H7z" />
      <path d="M9.5 9.5h5" />
      <path d="M9.5 12.5h5" />
      <path d="M9.5 15.5h3" />
    </>
  ),
  chemistry: (
    <>
      <path d="M10 4h4v3l3.5 8.5A2.2 2.2 0 0 1 15.4 19H8.6a2.2 2.2 0 0 1-2.1-3.5L10 7V4Z" />
      <path d="M9.2 13.5h5.6" />
    </>
  ),
  textile: (
    <>
      <path d="M6.5 8.5c0-2 1.8-3.5 4-3.5h3c2.2 0 4 1.5 4 3.5v8.2a1.8 1.8 0 0 1-1.8 1.8H8.3a1.8 1.8 0 0 1-1.8-1.8V8.5Z" />
      <path d="M9 8.5h6" />
      <path d="M9 12h6" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 9v3.5" />
      <path d="M12 15.5h.01" />
    </>
  ),
};

export function GroupIcon({ name = "other", className = "" }) {
  const key = PATHS[name] ? name : "other";
  return (
    <svg
      className={`sf-group-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width="28"
      height="28"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[key]}
    </svg>
  );
}
