## MCP Server Tools

### 1. Git Tools

- `git_status` - Check git repository status
- `git_diff` - Show git diff for files
- `git_add` - Stage files for commit
- `git_commit` - Commit staged changes
- `git_log` - View commit history
- `git_checkout` - Switch branches or restore files

### 2. File Tools

- `read_file` - Read file contents with offset and limit support
- `write_file` - Write or overwrite file content
- `edit_file` - Make targeted edits using SEARCH/REPLACE blocks
- `list_directory` - List directory contents
- `search_files` - Search file contents using regex
- `grep_files` - Fast content search across files
- `glob_files` - Find files by pattern

### 3. Code Analysis Tools

- `lsp_diagnostics` - Get errors/warnings from language server
- `lsp_goto_definition` - Jump to symbol definition
- `lsp_find_references` - Find all symbol references
- `lsp_rename` - Rename symbol across workspace
- `lsp_prepare_rename` - Check rename validity
- `ast_grep_search` - Search code using AST patterns
- `ast_grep_replace` - Replace code using AST patterns

### 4. Web Tools

- `webfetch` - Fetch content from URLs
- `websearch_web_search_exa` - Search web using Exa
- `grep_app_searchGitHub` - Search GitHub code examples

### 5. Documentation Tools

- `context7_resolve-library-id` - Find library in Context7
- `context7_query-docs` - Query library documentation

### 6. Session Tools

- `session_list` - List available sessions
- `session_read` - Read session messages
- `session_search` - Search session content
- `session_info` - Get session metadata

### 7. Background Tasks

- `background_output` - Get output from background tasks
- `background_cancel` - Cancel running background tasks

### 8. Sub-agents

- `task` - Spawn specialized sub-agents
  - Categories: visual-engineering, artistry, ultrabrain, deep, quick, writing
  - Types: explore, librarian, oracle, metis, momus

### 9. Utilities

- `bash` - Execute shell commands
- `skill` - Load specialized skill modules
- `todowrite` - Manage todo lists
- `question` - Ask user for input
