#!/usr/bin/env node
/**
 * ACP Protocol Detailed Debugger
 * Captures ALL messages from Kimi CLI to understand the response format
 */

const { spawn } = require('child_process');
const readline = require('readline');

let requestId = 0;
const pendingRequests = new Map();

console.log('🔍 ACP Protocol Debugger');
console.log('========================\n');
console.log('This script captures ALL messages from Kimi ACP\n');

// Start kimi acp process
console.log('🚀 Starting kimi acp...');
const kimi = spawn('kimi', ['acp'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('PID:', kimi.pid);
console.log('');

// Store all messages for analysis
const allMessages = [];

// Handle stderr
kimi.stderr.on('data', (data) => {
  const text = data.toString();
  console.log('📝 [STDERR]:', text);
});

// Handle stdout with detailed logging
const rl = readline.createInterface({
  input: kimi.stdout,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  
  console.log('\n📥 [RAW]:', line);
  console.log('📊 Length:', line.length, 'chars');
  
  try {
    const msg = JSON.parse(line);
    allMessages.push({
      timestamp: new Date().toISOString(),
      message: msg
    });
    
    // Detailed message analysis
    console.log('📋 [PARSED]:');
    console.log('   Type:', msg.jsonrpc ? 'JSON-RPC 2.0' : 'Unknown');
    
    if (msg.id !== undefined) {
      console.log('   Direction: Response (id:', msg.id + ')');
      
      if (msg.error) {
        console.log('   Status: ❌ ERROR');
        console.log('   Code:', msg.error.code);
        console.log('   Message:', msg.error.message);
        if (msg.error.data) {
          console.log('   Data:', JSON.stringify(msg.error.data, null, 2));
        }
        
        // Reject pending request
        if (pendingRequests.has(msg.id)) {
          const { reject } = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          reject(msg.error);
        }
      } else if (msg.result !== undefined) {
        console.log('   Status: ✅ SUCCESS');
        console.log('   Result:', JSON.stringify(msg.result, null, 2).substring(0, 500));
        
        // Resolve pending request
        if (pendingRequests.has(msg.id)) {
          const { resolve } = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          resolve(msg.result);
        }
      }
    } else if (msg.method) {
      console.log('   Direction: Notification');
      console.log('   Method:', msg.method);
      
      if (msg.params) {
        console.log('   Params:');
        console.log(JSON.stringify(msg.params, null, 2).substring(0, 800));
        
        // Check for session/update specifically
        if (msg.method === 'session/update' && msg.params) {
          const update = msg.params;
          console.log('\n   🔍 [Session Update Analysis]:');
          console.log('      sessionId:', update.sessionId);
          if (update.update) {
            const u = update.update;
            console.log('      sessionUpdate:', u.sessionUpdate);
            if (u.content) {
              console.log('      content.type:', u.content?.type);
              console.log('      content.text:', u.content?.text?.substring(0, 100));
            }
          }
        }
      }
    }
    
  } catch (e) {
    console.log('⚠️  [Parse Error]:', e.message);
    console.log('   Raw:', line.substring(0, 200));
  }
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
    
    console.log('\n📤 [SEND]:', method);
    console.log(JSON.stringify(request, null, 2));
    
    pendingRequests.set(id, { resolve, reject });
    kimi.stdin.write(JSON.stringify(request) + '\n');
  });
}

// Full test sequence
async function runFullTest() {
  let sessionId = null;
  
  try {
    // Wait for startup
    console.log('\n⏳ Waiting 2s for kimi to start...');
    await new Promise(r => setTimeout(r, 2000));
    
    // 1. Initialize
    console.log('\n\n========================================');
    console.log('STEP 1: Initialize');
    console.log('========================================');
    
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
          name: 'AgentLink-Debugger',
          version: '1.0.0'
        }
      });
      console.log('✅ Initialize successful');
    } catch (e) {
      console.log('❌ Initialize failed:', e.message);
      throw e;
    }
    
    // 2. Create Session
    console.log('\n\n========================================');
    console.log('STEP 2: Create Session');
    console.log('========================================');
    
    try {
      const sessionResult = await sendRequest('session/new', {
        cwd: process.cwd(),
        mcpServers: []
      });
      sessionId = sessionResult.sessionId;
      console.log('✅ Session created:', sessionId);
    } catch (e) {
      console.log('❌ Session creation failed:', e.message);
      throw e;
    }
    
    // 3. Send Prompt and capture ALL responses
    console.log('\n\n========================================');
    console.log('STEP 3: Send Prompt');
    console.log('========================================');
    console.log('Sending: "Hello, say hi in one word"\n');
    console.log('Waiting for responses... (30s timeout)\n');
    
    const promptPromise = sendRequest('session/prompt', {
      sessionId: sessionId,
      prompt: [
        {
          type: 'text',
          text: 'Hello, say hi in one word'
        }
      ]
    });
    
    // Wait with timeout
    try {
      const result = await Promise.race([
        promptPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
        )
      ]);
      console.log('\n✅ Prompt completed');
      console.log('Result:', result);
    } catch (e) {
      console.log('\n⚠️  Prompt wait ended:', e.message);
    }
    
    // Wait a bit more to capture any trailing messages
    console.log('\n⏳ Waiting 5s for any additional messages...');
    await new Promise(r => setTimeout(r, 5000));
    
  } catch (error) {
    console.error('\n💥 Test error:', error);
  } finally {
    // Print summary
    console.log('\n\n========================================');
    console.log('MESSAGE SUMMARY');
    console.log('========================================');
    console.log('Total messages captured:', allMessages.length);
    
    console.log('\n📊 Message Types:');
    const responses = allMessages.filter(m => m.message.id !== undefined);
    const notifications = allMessages.filter(m => m.message.method !== undefined);
    console.log('  - Responses:', responses.length);
    console.log('  - Notifications:', notifications.length);
    
    if (notifications.length > 0) {
      console.log('\n🔔 Notification Methods:');
      notifications.forEach(m => {
        console.log('  -', m.message.method);
      });
    }
    
    console.log('\n\nFull message log saved to memory');
    console.log('Closing kimi process...\n');
    
    kimi.kill();
    setTimeout(() => process.exit(0), 1000);
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Interrupted by user');
  console.log('\nCaptured', allMessages.length, 'messages');
  kimi.kill();
  process.exit(0);
});

// Run test
runFullTest();
