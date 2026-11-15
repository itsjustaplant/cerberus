export function collectionPath(id: string) {
  return `/collections/${encodeURIComponent(id)}`;
}

export function itemPath(collectionId: string, itemId: string) {
  return `${collectionPath(collectionId)}/items/${encodeURIComponent(itemId)}`;
}
