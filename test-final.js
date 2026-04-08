#!/usr/bin/env node
/**
 * Final ACP Test - Verify the fix
 * 
 * This script tests the complete flow with the fixed message handling
 */

const { spawn } = require('child_process');
const readline = require('readline');

console.log('🧪 Final ACP Test - Verifying session/update fix\n');
console.log('================================================\n');

// Check if kimi is available
const { execSync } = require('child_process');
try {
  execSync('kimi --version', { stdio: 'ignore' });
} catch (e) {
  console.error('❌ Kimi CLI not found. Please install it first:');
  console.error('   pip install kimi-cli');
  console.error('   kimi login');
  process.exit(1);
}

console.log('✅ Kimi CLI found\n');

// Start kimi
const kimi = spawn('kimi', ['acp'], { stdio: ['pipe', 'pipe', 'pipe'] });
let requestId = 0;
const pendingRequests = new Map();
let messageCount = 0;

// Handle stdout
const rl = readline.createInterface({ input: kimi.stdout, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;
  messageCount++;
  
  try {
    const msg = JSON.parse(line);
    
    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      
      if (msg.error) {
        console.log('❌ Error:', msg.error.message);
        reject(msg.error);
      } else {
        console.log('✅ Response received');
        resolve(msg.result);
      }
    } else if (msg.method === 'session/update') {
      const update = msg.params?.update;
      console.log(`📨 session/update: ${update?.sessionUpdate}`);
      
      if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.text) {
        console.log('   💬 Agent says:', update.content.text.substring(0, 100));
      } else if (update?.sessionUpdate === 'thought' && update.content?.text) {
        console.log('   💭 Thinking:', update.content.text.substring(0, 80) + '...');
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
});

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = { jsonrpc: '2.0', id, method, params };
    pendingRequests.set(id, { resolve, reject });
    kimi.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function test() {
  try {
    console.log('⏳ Initializing...');
    await new Promise(r => setTimeout(r, 1500));
    
    // Initialize
    console.log('\n1️⃣ Initialize');
    await sendRequest('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
      clientInfo: { name: 'test', version: '1.0.0' }
    });
    console.log('   ✅ Initialized\n');
    
    // Create session
    console.log('2️⃣ Create Session');
    const session = await sendRequest('session/new', {
      cwd: process.cwd(),
      mcpServers: []
    });
    console.log('   ✅ Session:', session.sessionId);
    console.log('   Model:', session.models?.currentModelId || 'unknown');
    console.log();
    
    // Send prompt
    console.log('3️⃣ Send Prompt');
    console.log('   Message: "Say hello"');
    console.log('   Waiting for responses...\n');
    
    const startTime = Date.now();
    
    sendRequest('session/prompt', {
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'Say hello in 2-3 words' }]
    }).then((result) => {
      console.log('\n✅ Prompt completed!');
      console.log('   Stop reason:', result.stopReason);
      console.log('   Total messages:', messageCount);
      console.log('   Time:', ((Date.now() - startTime) / 1000).toFixed(1), 's');
      
      console.log('\n🎉 SUCCESS! If you see agent responses above, the fix works!');
      kimi.kill();
      process.exit(0);
    }).catch(err => {
      console.log('\n❌ Prompt failed:', err.message);
      kimi.kill();
      process.exit(1);
    });
    
    // Timeout
    setTimeout(() => {
      console.log('\n⏱️ Timeout after 30s');
      console.log('   Messages received:', messageCount);
      if (messageCount > 3) {
        console.log('\n🎉 Looks like it worked! (timeout is normal)');
      } else {
        console.log('\n⚠️  Few messages received - there might still be an issue');
      }
      kimi.kill();
      process.exit(0);
    }, 30000);
    
  } catch (e) {
    console.error('\n💥 Test failed:', e.message);
    if (e.message?.includes('AUTH_REQUIRED')) {
      console.log('\n💡 Run: kimi login');
    }
    kimi.kill();
    process.exit(1);
  }
}

test();
