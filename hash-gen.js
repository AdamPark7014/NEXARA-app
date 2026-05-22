const bcrypt = require('bcryptjs');

async function generateHashes() {
  const pass1 = 'NexaraCeo2026@12888';
  const pass2 = 'Developer2026@Nexara';
  
  const hash1 = await bcrypt.hash(pass1, 10);
  const hash2 = await bcrypt.hash(pass2, 10);
  
  console.log('CEO Hash:', hash1);
  console.log('Dev Hash:', hash2);
}

generateHashes();
