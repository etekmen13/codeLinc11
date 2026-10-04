export function displayText(text: string): string {
  return text.replace(/\bD\d{4}\b/gi, "the treatment");
}
