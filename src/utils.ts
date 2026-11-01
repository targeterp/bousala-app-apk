import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizePhoneNumber(phone: string): string {
  if (!phone) return '';
  // Convert Eastern Arabic numerals (٠-٩) and Persian (۰-۹) to standard Western digits (0-9)
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  let cleaned = phone.trim();
  arabicDigits.forEach((d, i) => {
    cleaned = cleaned.replace(new RegExp(d, 'g'), i.toString());
  });
  persianDigits.forEach((d, i) => {
    cleaned = cleaned.replace(new RegExp(d, 'g'), i.toString());
  });
  // Strip all non-digit characters (+, -, spaces, parentheses, etc.)
  cleaned = cleaned.replace(/\D/g, '');
  // Remove Mauritania country code (00222 or 222) if prepended to standard 8-digit number
  if (cleaned.startsWith('00222') && cleaned.length >= 13) {
    cleaned = cleaned.substring(5);
  } else if (cleaned.startsWith('222') && cleaned.length >= 11) {
    cleaned = cleaned.substring(3);
  }
  return cleaned;
}

