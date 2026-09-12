"use client";

import PhoneInput, {
  isPossiblePhoneNumber,
  type Country,
  type Value,
} from "react-phone-number-input";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import styles from "./PhoneField.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** ISO country, default México. */
  defaultCountry?: Country;
  style?: React.CSSProperties;
  invalid?: boolean;
};

/** Vacío = ok (opcional). Con valor: debe ser número posible. */
export function isValidNexaraPhone(value: string): boolean {
  const v = (value || "").trim();
  if (!v) return true;
  try {
    return isPossiblePhoneNumber(v);
  } catch {
    return false;
  }
}

/** Normaliza locales (2211191846) o E.164 a E.164; si no parsea, deja el raw. */
export function toE164Phone(raw: string, defaultCountry: Country = "MX"): string {
  const t = (raw || "").trim();
  if (!t) return "";
  try {
    const phone = parsePhoneNumberFromString(t, defaultCountry);
    return phone?.number ?? t;
  } catch {
    return t;
  }
}

export default function PhoneField({
  value,
  onChange,
  id,
  name,
  disabled = false,
  required = false,
  placeholder,
  className,
  inputClassName,
  defaultCountry = "MX",
  style,
  invalid = false,
}: Props) {
  const display = value ? toE164Phone(value, defaultCountry) : "";

  return (
    <PhoneInput
      international
      countryCallingCodeEditable={false}
      flags={flags}
      defaultCountry={defaultCountry}
      value={(display || undefined) as Value | undefined}
      onChange={(next) => onChange((next as string | undefined) ?? "")}
      disabled={disabled}
      className={`${styles.wrap}${invalid ? ` ${styles.invalid}` : ""}${className ? ` ${className}` : ""}`}
      style={style}
      numberInputProps={{
        id,
        name,
        required,
        placeholder: placeholder ?? "222 123 4567",
        className: inputClassName,
        autoComplete: "tel",
        inputMode: "tel",
      }}
      countrySelectProps={{
        "aria-label": "País",
        title: "País",
      }}
    />
  );
}
