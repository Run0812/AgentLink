#!/usr/bin/env node
/**
 * ACP Connection Test using official SDK
 * Tests the connection to Kimi CLI using @agentclientprotocol/sdk
 * 
 * This script follows AGENTS.md requirements:
 * - Uses official @agentclientprotocol/sdk
 * - All communication output to console
 * - No handwritten JSON-RPC
 */

import { spawn } from 'child_process';
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';

console.log('🧪 Testing ACP connection to Kimi CLI using official SDK');
console.log('=' .repeat(60));

async function testAcpConnection() {
  // Start Kimi CLI in ACP mode
  console.log('\n🚀 Starting kimi acp...');
  const kimi = spawn('kimi', ['acp'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  console.log(`✅ Process started, PID: ${kimi.pid}`);

  // Handle process errors
  kimi.on('error', (error) => {
    console.error('❌ Failed to start kimi:', error.message);
    console.error('   Make sure kimi is installed: pip install kimi-cli');
    process.exit(1);
  });

  // Wait a moment for process to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Create SDK stream from stdio
    console.log('\n📡 Creating SDK stream...');
    const stream = ndJsonStream(kimi.stdout, kimi.stdin);
    console.log('✅ SDK stream created');

    // Create client handler with console logging
    const client = {
      sessionUpdate: async (params) => {
        console.log('[ACP] sessionUpdate:', params.update?.sessionUpdate);
        
        if (params.update?.content?.text) {
          console.log('[ACP] Content:', params.update.content.text.substring(0, 100));
        }
        
        return Promise.resolve();
      },
      
      requestPermission: async (params) => {
        console.log('[ACP] requestPermission:', params);
        // Auto-allow for testing
        return { outcome: { outcome: 'selected', optionId: 'allow' } };
      },
      
      readTextFile: async (params) => {
        console.log('[ACP] readTextFile:', params.path);
        const fs = await import('fs/promises');
        try {
          const content = await fs.readFile(params.path, 'utf-8');
          console.log('[ACP] File read successfully');
          return { content };
        } catch (error) {
          console.error('[ACP] Error reading file:', error.message);
          throw error;
        }
      },
      
      writeTextFile: async (params) => {
        console.log('[ACP] writeTextFile:', params.path);
        const fs = await import('fs/promises');
        try {
          await fs.writeFile(params.path, params.content, 'utf-8');
          console.log('[ACP] File written successfully');
          return {};
        } catch (error) {
          console.error('[ACP] Error writing file:', error.message);
          throw error;
        }
      },
      
      terminalOutput: async (params) => {
        console.log('[ACP] terminalOutput:', params);
        return { output: '', truncated: false };
      },
      
      waitForTerminalExit: async (params) => {
        console.log('[ACP] waitForTerminalExit:', params);
        return { exitCode: 0, signal: null };
      },
      
      killTerminal: async (params) => {
        console.log('[ACP] killTerminal:', params);
        return {};
      },
      
      releaseTerminal: async (params) => {
        console.log('[ACP] releaseTerminal:', params);
        return {};
      }
    };

    // Create connection using SDK
    console.log('\n🔗 Creating ClientSideConnection...');
    const connection = new ClientSideConnection(() => client, stream);
    console.log('✅ Connection created');

    // Test 1: Initialize
    console.log('\n=== Test 1: Initialize ===');
    console.log('[ACP] Sending initialize request...');
    
    const initResult = await connection.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: false
      },
      clientInfo: {
        name: 'AgentLink-Test',
        version: '1.0.0'
      }
    });
    
    console.log('✅ Initialize successful!');
    console.log('   Agent:', initResult.agentInfo?.name);
    console.log('   Version:', initResult.agentInfo?.version);
    console.log('   Protocol:', initResult.protocolVersion);

    // Test 2: Create Session
    console.log('\n=== Test 2: Create Session ===');
    console.log('[ACP] Creating new session...');
    
    const session = await connection.newSession({
      cwd: process.cwd(),
      mcpServers: []
    });
    
    console.log('✅ Session created!');
    console.log('   Session ID:', session.sessionId);

    // Test 3: Send Prompt
    console.log('\n=== Test 3: Send Prompt ===');
    console.log('[ACP] Sending prompt...');
    
    const response = await connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'Hello! Say "Test successful" and nothing else.' }]
    });
    
    console.log('✅ Prompt completed!');
    console.log('   Stop reason:', response.stopReason);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All SDK tests passed!');
    console.log('   The ACP SDK integration is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    kimi.kill();
    console.log('✅ Process terminated');
  }
}

// Run tests
testAcpConnection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
