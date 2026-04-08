#!/usr/bin/env node
/**
 * Test ACP connection with Kimi CLI
 * 
 * Usage: node test-kimi-acp.js
 */

const { spawn } = require('child_process');
const readline = require('readline');

let requestId = 0;
const pendingRequests = new Map();

console.log('🧪 Testing ACP connection to Kimi CLI');
console.log('=====================================\n');

// Start kimi acp process
console.log('🚀 Starting kimi acp...');
const kimi = spawn('kimi', ['acp'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('✅ Process started, PID:', kimi.pid);
console.log('');

// Handle stderr
kimi.stderr.on('data', (data) => {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      console.log('📋 [kimi log]:', line);
    }
  });
});

// Handle stdout
const rl = readline.createInterface({
  input: kimi.stdout,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  
  console.log('📥 [Received]:', line.substring(0, 200));
  if (line.length > 200) console.log('... (truncated)');
  
  try {
    const msg = JSON.parse(line);
    
    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      
      if (msg.error) {
        console.log('❌ [Error]:', JSON.stringify(msg.error, null, 2));
        reject(msg.error);
      } else {
        console.log('✅ [Success]:', JSON.stringify(msg.result, null, 2).substring(0, 500));
        if (JSON.stringify(msg.result).length > 500) console.log('... (truncated)');
        resolve(msg.result);
      }
    } else if (msg.method) {
      console.log('🔔 [Notification]:', msg.method);
      if (msg.params) {
        console.log('   Params:', JSON.stringify(msg.params, null, 2).substring(0, 300));
      }
    }
  } catch (e) {
    console.log('⚠️  [Parse error]:', e.message);
  }
  
  console.log('');
});

// Send request function
function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    console.log('📤 [Sending]:', JSON.stringify(request, null, 2));
    
    pendingRequests.set(id, { resolve, reject });
    
    kimi.stdin.write(JSON.stringify(request) + '\n');
  });
}

// Test sequence
async function runTests() {
  try {
    // Wait for kimi to start
    console.log('⏳ Waiting for kimi to initialize...\n');
    await new Promise(r => setTimeout(r, 2000));
    
    // Test 1: Initialize
    console.log('=== Test 1: Initialize ===');
    try {
      const initResult = await sendRequest('initialize', {
        protocolVersion: 1,
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true
          }
        },
        clientInfo: {
          name: 'AgentLink-Test',
          version: '1.0.0'
        }
      });
      console.log('\n✅ Initialize successful!');
      console.log('   Agent:', initResult.agentInfo?.name, initResult.agentInfo?.version);
      console.log('   Protocol version:', initResult.protocolVersion);
    } catch (e) {
      console.log('\n❌ Initialize failed:', e.message);
      if (e.message?.includes('AUTH_REQUIRED')) {
        console.log('\n💡 Please run "kimi login" first!');
      }
      throw e;
    }
    
    // Test 2: Create session
    console.log('\n=== Test 2: Create Session ===');
    let sessionId;
    try {
      const sessionResult = await sendRequest('session/new', {
        cwd: process.cwd(),
        mcpServers: []
      });
      sessionId = sessionResult.sessionId;
      console.log('\n✅ Session created:', sessionId);
      console.log('   Current mode:', sessionResult.modes?.currentModeId);
      console.log('   Current model:', sessionResult.models?.currentModelId);
    } catch (e) {
      console.log('\n❌ Session creation failed:', e.message);
      if (e.message?.includes('AUTH_REQUIRED')) {
        console.log('\n💡 Please run "kimi login" first!');
      }
      throw e;
    }
    
    // Test 3: Send prompt
    console.log('\n=== Test 3: Send Prompt ===');
    console.log('Sending: "Say hello in one word"');
    
    try {
      const promptPromise = sendRequest('session/prompt', {
        sessionId: sessionId,
        prompt: [
          {
            type: 'text',
            text: 'Say hello in one word'
          }
        ]
      });
      
      // Wait for response (with timeout)
      const result = await Promise.race([
        promptPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 30000)
        )
      ]);
      
      console.log('\n✅ Prompt completed!');
      console.log('   Stop reason:', result.stopReason);
      
    } catch (e) {
      console.log('\n❌ Prompt failed:', e.message);
    }
    
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
  } finally {
    console.log('\n=== Test Complete ===');
    console.log('Closing kimi process...');
    kimi.kill();
    setTimeout(() => process.exit(0), 1000);
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Interrupted');
  kimi.kill();
  process.exit(0);
});

// Run tests
runTests();
