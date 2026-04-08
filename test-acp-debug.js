#!/usr/bin/env node
/**
 * ACP Protocol Debugger
 * 
 * This script tests the ACP connection to Kimi CLI and logs all messages
 * for debugging purposes.
 */

const { spawn } = require('child_process');
const readline = require('readline');

let requestId = 0;
const pendingRequests = new Map();

// Start kimi acp process
const kimi = spawn('kimi', ['acp'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('🚀 Started kimi acp process');
console.log('PID:', kimi.pid);
console.log('');

// Handle stderr (logs)
kimi.stderr.on('data', (data) => {
  console.log('📋 [kimi stderr]:', data.toString());
});

// Handle stdout (ACP messages)
const rl = readline.createInterface({
  input: kimi.stdout,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  
  console.log('📥 [Received]:', line);
  
  try {
    const msg = JSON.parse(line);
    
    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
      // This is a response
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      
      if (msg.error) {
        console.log('❌ [Error]:', msg.error);
        reject(msg.error);
      } else {
        console.log('✅ [Success]:', JSON.stringify(msg.result, null, 2));
        resolve(msg.result);
      }
    } else if (msg.method) {
      // This is a notification from server
      console.log('🔔 [Notification]:', msg.method);
      console.log('   Params:', JSON.stringify(msg.params, null, 2));
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
async function testACP() {
  try {
    // Wait a bit for kimi to start
    await new Promise(r => setTimeout(r, 1000));
    
    // Test 1: Initialize with minimal params
    console.log('=== Test 1: Initialize (minimal) ===');
    try {
      const initResult = await sendRequest('initialize', {
        protocolVersion: 1,
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      });
      console.log('Initialize result:', initResult);
    } catch (e) {
      console.log('Initialize failed:', e);
    }
    
    // Test 2: Try with clientCapabilities
    console.log('\n=== Test 2: Initialize (with capabilities) ===');
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
          name: 'test-client',
          version: '1.0.0'
        }
      });
      console.log('Initialize result:', initResult);
    } catch (e) {
      console.log('Initialize failed:', e);
    }
    
    // Test 3: Create session
    console.log('\n=== Test 3: Create session ===');
    try {
      const sessionResult = await sendRequest('session/new', {
        workspaceRoot: process.cwd()
      });
      console.log('Session result:', sessionResult);
    } catch (e) {
      console.log('Session creation failed:', e);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests
testACP();

// Keep process alive
setTimeout(() => {
  console.log('\n⏹️  Closing...');
  kimi.kill();
  process.exit(0);
}, 30000);

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n⏹️  Interrupted');
  kimi.kill();
  process.exit(0);
});
