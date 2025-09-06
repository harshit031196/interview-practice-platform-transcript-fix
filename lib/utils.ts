import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getReadinessColor(score: number): string {
  if (score >= 75) return "text-green-600"
  if (score >= 50) return "text-yellow-600"
  return "text-red-600"
}

export function getReadinessBgColor(score: number): string {
  if (score >= 75) return "bg-green-100"
  if (score >= 50) return "bg-yellow-100"
  return "bg-red-100"
}

export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
}
