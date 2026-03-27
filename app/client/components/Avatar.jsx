import React from 'react';

const COLORS = ['#0a84ff','#30d158','#ff9f0a','#bf5af2','#ff453a','#64d2ff'];

function colorFor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return COLORS[h % COLORS.length];
}

export default function Avatar({ name = '', size = 44, src }) {
  const bg = colorFor(name);
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="avatar" style={{ width: size, height: size, background: src ? 'transparent' : bg + '33', color: bg, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt={name} /> : initials || '?'}
    </div>
  );
}
