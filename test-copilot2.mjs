async function test() {
  try {
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        'User-Agent': 'GithubCopilot/1.156.0',
        'Editor-Version': 'vscode/1.83.0',
        'Editor-Plugin-Version': 'copilot/1.156.0',
        'Accept': 'application/json'
      }
    });
    const data = await res.json();
    console.log(res.status, data);
  } catch (e) {
    console.log(e);
  }
}
test();
