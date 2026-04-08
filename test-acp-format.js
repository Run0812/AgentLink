#!/usr/bin/env node
/**
 * Test ACP session/update message handling
 * Simulates the actual message format from Kimi CLI
 */

console.log('🧪 Testing ACP session/update message format\n');

// Simulated ACP messages as they come from Kimi CLI
const testMessages = [
  {
    description: 'Agent message chunk',
    message: {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_test123',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: {
            type: 'text',
            text: 'Hello! This is a test response from the agent.'
          }
        }
      }
    }
  },
  {
    description: 'Thought/reasoning',
    message: {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_test123',
        update: {
          sessionUpdate: 'thought',
          content: {
            type: 'thinking',
            text: 'Let me analyze this request...'
          }
        }
      }
    }
  },
  {
    description: 'Tool call initiated',
    message: {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_test123',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call_001',
          title: 'Reading file',
          kind: 'fs',
          status: 'pending'
        }
      }
    }
  },
  {
    description: 'Tool call completed',
    message: {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_test123',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call_001',
          status: 'completed',
          content_blocks: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'File content here...'
              }
            }
          ]
        }
      }
    }
  },
  {
    description: 'Plan',
    message: {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sess_test123',
        update: {
          sessionUpdate: 'plan',
          entries: [
            { content: 'Analyze the code', priority: 'high', status: 'completed' },
            { content: 'Suggest improvements', priority: 'medium', status: 'in_progress' }
          ]
        }
      }
    }
  }
];

// Simulate the handler logic from AcpBridgeAdapter
class TestAdapter {
  responseBuffer = [];
  
  handleSessionUpdate(params) {
    const { sessionId, update } = params;
    
    console.log(`\n📨 Handling: ${update.sessionUpdate}`);
    console.log(`   Session: ${sessionId}`);
    
    switch (update.sessionUpdate) {
      case 'agent_message_chunk':
        if (update.content?.text) {
          this.responseBuffer.push(update.content.text);
          console.log('   ✅ Text:', update.content.text.substring(0, 50));
        }
        break;
        
      case 'thought':
        if (update.content?.text) {
          const formatted = `<thinking>\n${update.content.text}\n</thinking>\n\n`;
          this.responseBuffer.push(formatted);
          console.log('   ✅ Thought:', update.content.text.substring(0, 50));
        }
        break;
        
      case 'tool_call':
        if (update.toolCallId) {
          console.log('   ✅ Tool call:', update.toolCallId, update.title);
        }
        break;
        
      case 'tool_call_update':
        if (update.toolCallId) {
          console.log('   ✅ Tool update:', update.toolCallId, update.status);
          if (update.content_blocks) {
            for (const block of update.content_blocks) {
              if (block.content?.text) {
                console.log('   Result:', block.content.text.substring(0, 50));
              }
            }
          }
        }
        break;
        
      case 'plan':
        if (update.entries) {
          console.log('   ✅ Plan with', update.entries.length, 'entries');
          update.entries.forEach(e => {
            console.log(`      [${e.status}] ${e.content}`);
          });
        }
        break;
        
      default:
        console.log('   ⚠️ Unknown type:', update.sessionUpdate);
    }
  }
}

// Run tests
const adapter = new TestAdapter();

console.log('Testing', testMessages.length, 'message types:\n');

testMessages.forEach((test, index) => {
  console.log(`\n--- Test ${index + 1}: ${test.description} ---`);
  console.log('Raw:', JSON.stringify(test.message, null, 2).substring(0, 200));
  
  if (test.message.method === 'session/update') {
    adapter.handleSessionUpdate(test.message.params);
  }
});

console.log('\n\n📊 Summary:');
console.log('Total messages processed:', testMessages.length);
console.log('Response buffer items:', adapter.responseBuffer.length);
console.log('\n✅ All tests passed!');
