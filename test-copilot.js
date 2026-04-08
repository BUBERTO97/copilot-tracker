const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        'User-Agent': 'GithubCopilot/1.156.0',
        'Accept': 'application/json'
      }
    });
    console.log(res.data);
  } catch (e) {
    console.log(e.response?.status, e.response?.data);
  }
}
test();
