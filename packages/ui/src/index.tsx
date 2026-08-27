import type { ReactNode } from 'react';

export interface StatusMessageProps {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
}

export function StatusMessage({ tone, children }: StatusMessageProps) {
  return (
    <div className={`status status-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
