import React from 'react';

export default function TabBar({ tabs, active, onChange, badges = {} }) {
  return (
    <nav className="tabbar">
      {tabs.map(tab => (
        <button
          key={tab.key}
          className={`tab-item ${active === tab.key ? 'active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
          {badges[tab.key] > 0 && (
            <span className="tab-badge">{badges[tab.key] > 99 ? '99+' : badges[tab.key]}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
