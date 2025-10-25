# Test Context Documentation

This directory contains comprehensive context documentation for the ABIS Playwright test suite.

## 📚 Available Context Files

### 1. [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md)
**Complete End-to-End Workflow Documentation**

Comprehensive documentation covering the entire ABIS sanity test workflow from lead creation to payment collection.

**Contents:**
- 📋 Overview and architecture
- 🎯 13-phase workflow breakdown with detailed steps
- 🛠️ Helper classes API reference
- 📊 Data flow and state management
- 🎨 Design patterns used
- 🚨 Robustness strategies
- 🐛 Troubleshooting guide
- 📈 Performance optimization tips

**Use this for:**
- Understanding the complete business workflow
- Debugging test failures
- Adding new test phases
- Training new team members
- AI assistant context

---

### 2. [setup.md](./setup.md)
**Test Generation Context**

Guidelines for generating Playwright tests using AI assistance and MCP tools.

**Contents:**
- Test generator role and responsibilities
- Scenario-based test generation approach
- MCP tools integration
- Environment variable usage
- Iterative test development process

**Use this for:**
- Creating new Playwright tests
- Understanding test generation workflow
- AI-assisted test development
- MCP tool integration

---

## 🗂️ Directory Structure

```
test_contexts/
├── README.md                   # This index file
├── WORKFLOW_CONTEXT.md         # Complete workflow documentation (10,000+ words)
└── setup.md                    # Test generation context
```

---

## 🎯 Quick Navigation

### For Developers

**New to the project?**
→ Start with [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md) sections:
1. Overview
2. Architecture
3. Phase-by-phase workflow (read one at a time)

**Need to debug a test?**
→ Go to [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md) → Debugging Guide

**Want to add a new test phase?**
→ Review [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md) → Design Patterns & Helper Classes

**Creating new tests with AI?**
→ Start with [setup.md](./setup.md) for test generation guidelines

---

### For AI Assistants

**Understanding the codebase?**
→ Read [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md) in full for complete context

**Debugging failures?**
→ Reference [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md) → Common Issues & Solutions

**Extending functionality?**
→ Study [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md) → Design Patterns & Helper Classes

**Generating new tests?**
→ Follow [setup.md](./setup.md) guidelines with MCP tools

---

## 📖 Document Summaries

| File | Lines | Last Updated | Purpose |
|------|-------|--------------|---------|
| WORKFLOW_CONTEXT.md | ~1000 | Oct 2025 | Complete workflow documentation |
| setup.md | ~15 | - | Test generation guidelines |

---

## 🔄 Maintenance

### When to Update

- **WORKFLOW_CONTEXT.md**: When test workflow changes, new phases added, or selectors updated
- **setup.md**: When test generation process changes or new MCP tools added

### How to Update

1. Make changes to the relevant context file
2. Update the "Last Updated" date in this README
3. Commit with descriptive message: `docs: update context for [change description]`

---

## 🤝 Contributing

When adding new context files:

1. Create the file in this directory
2. Add entry to this README with:
   - Link to the file
   - Brief description
   - Contents list
   - Use cases
3. Update the Directory Structure section
4. Update the Document Summaries table

---

## 📞 Support

For questions or issues with the documentation:
- Check [WORKFLOW_CONTEXT.md](./WORKFLOW_CONTEXT.md) → Debugging Guide
- Review test logs and screenshots
- Consult helper class implementations in `utils/`

---

**Last Updated:** October 23, 2025  
**Maintained by:** Test Automation Team
