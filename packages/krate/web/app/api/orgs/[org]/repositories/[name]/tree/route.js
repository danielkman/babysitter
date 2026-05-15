// TODO: When Gitea is connected, replace this mock with a real Gitea API call:
//   GET /api/v1/repos/{owner}/{repo}/contents/{path}?ref={branch}
//   or GET /api/v1/repos/{owner}/{repo}/git/trees/{sha}?recursive=false

export async function GET(request, { params }) {
  const { org, name } = await params;
  const { searchParams } = new URL(request.url);
  const branch = searchParams.get('branch') || 'main';
  const currentPath = searchParams.get('path') || '';

  // Mock full tree — replace with Gitea API when connected
  const fullTree = [
    { path: 'README.md', type: 'blob', size: 1024 },
    { path: 'src', type: 'tree', size: 0 },
    { path: 'src/index.js', type: 'blob', size: 2048 },
    { path: 'src/utils.js', type: 'blob', size: 896 },
    { path: 'src/components', type: 'tree', size: 0 },
    { path: 'src/components/App.jsx', type: 'blob', size: 1536 },
    { path: 'src/components/Header.jsx', type: 'blob', size: 768 },
    { path: 'tests', type: 'tree', size: 0 },
    { path: 'tests/index.test.js', type: 'blob', size: 512 },
    { path: 'package.json', type: 'blob', size: 512 },
    { path: '.gitignore', type: 'blob', size: 128 },
    { path: 'LICENSE', type: 'blob', size: 1064 },
    { path: 'Dockerfile', type: 'blob', size: 384 },
  ];

  // Return items that are direct children of currentPath
  const tree = fullTree.filter((item) => {
    if (!currentPath) {
      // Root level: items with no slash in path
      return !item.path.includes('/');
    } else {
      // In a subdirectory: items that start with currentPath/ and have no further slashes
      if (!item.path.startsWith(currentPath + '/')) return false;
      const remainder = item.path.slice(currentPath.length + 1);
      return !remainder.includes('/');
    }
  });

  return Response.json({
    tree,
    repo: name,
    org,
    branch,
    path: currentPath,
    // Metadata for UI display
    totalItems: tree.length,
  });
}
