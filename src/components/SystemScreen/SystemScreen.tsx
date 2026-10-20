import type { ReactNode } from 'react';
import { BrandMark } from '../BrandMark/BrandMark';
import styles from './SystemScreen.module.css';

// A whole-screen system state with nothing to tap — the stand not
// recognised, a session being deleted (2026-10 redesign, batch 7): the brand
// in its usual corner, one big icon, one sentence, and an optional small
// line underneath. No header or footer, since nothing there would work.
interface SystemScreenProps {
  id?: string;
  icon: ReactNode;
  tone?: 'neutral' | 'warning';
  title: string;
  text?: string;
  children?: ReactNode;
}

export function SystemScreen({
  id,
  icon,
  tone = 'neutral',
  title,
  text,
  children,
}: SystemScreenProps) {
  return (
    <div className={styles.root} id={id}>
      <div className={styles.brand}>
        <BrandMark />
      </div>
      <div className={styles.body}>
        <span className={styles.badge} data-tone={tone} aria-hidden="true">
          {icon}
        </span>
        <h1 className={styles.title}>{title}</h1>
        {text && <p className={styles.text}>{text}</p>}
        {children}
      </div>
    </div>
  );
}
