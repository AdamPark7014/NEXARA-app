import styles from "./FeatureStrip.module.css";

type Feature = {
  icon: "cctv" | "wifi" | "rack" | "support" | "ai";
  label: string;
};

type Props = {
  items: Feature[];
  className?: string;
};

function Icon({ name }: { name: Feature["icon"] }) {
  switch (name) {
    case "cctv":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 10.5 14 6l7 3-11 5-7-3.5Zm0 2.6 7 3.4v3.5H7.5a1 1 0 0 1-1-1v-2.2L3 15.5v-2.4Zm9 .4 6-2.7v6.7l-4.2-2-1.8.8v-2.8Z" />
        </svg>
      );
    case "wifi":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6.6-5.1a10.5 10.5 0 0 1 13.2 0l-1.4 1.7a8.1 8.1 0 0 0-10.4 0l-1.4-1.7Zm-3.2-4a15.5 15.5 0 0 1 19.6 0l-1.6 1.9a13.1 13.1 0 0 0-16.4 0l-1.6-1.9Z" />
        </svg>
      );
    case "rack":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M5 3h14a1 1 0 0 1 1 1v4H4V4a1 1 0 0 1 1-1Zm-1 8h16v4H4v-4Zm0 6h16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3Zm3.5-11.5h2v2h-2v-2Zm0 6h2v2h-2v-2Zm0 6h2v2h-2v-2Z" />
        </svg>
      );
    case "support":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3a7 7 0 0 1 7 7v6a2 2 0 0 1-2 2h-3v-2h3v-3h-2a1 1 0 0 1-1-1V9a4 4 0 1 0-8 0v3a1 1 0 0 1-1 1H3v3h3v2H5a2 2 0 0 1-2-2v-6a7 7 0 0 1 7-7Zm1 14v2h-2v-2h2Z" />
        </svg>
      );
    case "ai":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2 9.5 7H4l2.5 5L4 17h5.5L12 22l2.5-5H20l-2.5-5L20 7h-5.5L12 2Zm0 6.5 1.2 2.5H16l-1.2 2.5L16 16h-2.8L12 18.5 10.8 16H8l1.2-2.5L8 11h2.8L12 8.5Z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function FeatureStrip({ items, className }: Props) {
  return (
    <div className={`${styles.strip} ${className || ""}`}>
      <div className={styles.row}>
        {items.map((it, idx) => (
          <div key={`${it.icon}-${idx}`} className={styles.item} data-reveal="up">
            <div className={styles.icon} aria-hidden>
              <Icon name={it.icon} />
            </div>
            <p className={styles.label}>{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

