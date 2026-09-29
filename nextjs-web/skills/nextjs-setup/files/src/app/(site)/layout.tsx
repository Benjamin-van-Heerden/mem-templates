import styles from "./site.module.css";

// Public pages: bespoke markup and CSS, built on the design tokens in globals.css rather than on shadcn.
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <div className={styles.site}>{children}</div>;
}
