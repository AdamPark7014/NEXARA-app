/** Server-safe JSON-LD script with XSS-hardening for `<`. */

type JsonLdProps = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

export function jsonLdScript(data: JsonLdProps["data"]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
    />
  );
}

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
}
