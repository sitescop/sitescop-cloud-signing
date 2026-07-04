// GitHub Cloud Signing — client portal configuration
// 1. Copy this file to config.js in the same folder on your GitHub repo.
// 2. Never commit config.js (it contains your token).
window.SITESCOP_SIGN_CONFIG = {
  owner: 'your-github-username',
  repo: 'your-repo-name',
  branch: 'main',
  // Fine-grained or classic PAT with Contents: Read and write for this repo only.
  token: 'ghp_your_signing_token_here',
};
