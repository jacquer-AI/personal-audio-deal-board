/** External Vinted search is discovery, not a verified purchasable offer. */
export function vintedSearchUrl(model: string): string {
  return 'https://www.vinted.pl/catalog?search_text=' + encodeURIComponent(model.trim() || 'słuchawki');
}
