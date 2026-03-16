import React from 'react';

interface HelpTabProps {
  module: string;
  user?: any;
}

// Simple mobile HelpTab wrapper, can be extended for mobile-specific help logic
const HelpTab: React.FC<HelpTabProps> = ({ module, user }) => {
  // Placeholder: In a real app, fetch help content based on module/user profile
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <strong>Ayuda para {module}</strong>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
        Aquí aparecerán indicaciones y tips personalizados para este módulo según tu perfil.
      </div>
    </div>
  );
};

export default HelpTab;
