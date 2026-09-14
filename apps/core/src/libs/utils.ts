import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const isNumeric = (str: string) => typeof str === "string" && str.trim() !== "" && Number.isFinite(+str);
