export function filterLibrary(data, { folder, search, studio, status, order }) {
  const query = search.trim().toLocaleLowerCase();
  const matches = (p) => p.name.toLocaleLowerCase().includes(query);
  const sorted = (items) =>
    items.sort(
      (a, b) =>
        (Date.parse(b.updated_at) - Date.parse(a.updated_at)) * (order === 'oldest' ? -1 : 1) ||
        a.name.localeCompare(b.name),
    );
  return {
    folders: folder ? [] : sorted(data.folders.filter(matches)),
    projects: sorted(
      data.projects.filter(
        (p) =>
          ((!folder && query) || p.folderId === folder) &&
          matches(p) &&
          (!studio || p.studio === studio) &&
          (!status || p.status === status),
      ),
    ),
  };
}
