fetch('http://127.0.0.1:8787/api/health')
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1))
