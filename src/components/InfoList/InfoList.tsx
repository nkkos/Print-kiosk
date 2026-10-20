import type { ReactNode } from 'react';
import styles from './InfoList.module.css';

// Short facts in a popup — Help's steps, "how we protect your data": an
// icon, a few words, one line of detail. Lighter than StepList (no cards),
// since it sits inside a popup that is already a card. `numbered` for a
// sequence (Help); plain for a set of facts.
export interface InfoItem {
  icon: ReactNode;
  title: string;
  text: string;
}

export function InfoList({
  items,
  numbered = false,
  id,
}: {
  items: InfoItem[];
  numbered?: boolean;
  id?: string;
}) {
  return (
    <ul className={styles.root} id={id}>
      {items.map((item, index) => (
        <li className={styles.item} key={item.title}>
          <span className={styles.icon} aria-hidden="true">
            {item.icon}
            {numbered && <span className={styles.number}>{index + 1}</span>}
          </span>
          <span className={styles.body}>
            <span className={styles.title}>{item.title}</span>
            <span className={styles.text}>{item.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
