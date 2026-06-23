"use client";

import React from "react";
import { openExternalUrl } from "@/lib/open-external-url";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  href: string;
};

export default function ExternalLinkButton({ href, type, ...props }: Props) {
  return (
    <button
      {...props}
      type={type ?? "button"}
      onClick={() => {
        void openExternalUrl(href);
      }}
    />
  );
}

