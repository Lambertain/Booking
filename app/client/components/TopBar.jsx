import React from 'react';

export default function TopBar({ title, left, right }) {
  return (
    <header className="topbar">
      <div style={{ width: 80, display: 'flex', alignItems: 'center' }}>{left}</div>
      <div className="topbar-title">{title}</div>
      <div style={{ width: 80, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{right}</div>
    </header>
  );
}
