# Contributing to FlowMind

Thank you for your interest in contributing to FlowMind! 🎉

## 🤝 Ways to Contribute

- 🐛 **Report bugs** - Help us identify issues
- 💡 **Suggest features** - Share your ideas
- 📝 **Improve docs** - Make documentation better
- 🛠️ **Add skills** - Create new capabilities
- 🌍 **Translations** - Help localize
- 🧪 **Write tests** - Improve quality

## 🚀 Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/your-username/flowmind.git
cd flowmind
```

### 2. Install Dependencies

```bash
nvm use 20
npm install
```

FlowMind runtime supports Node.js 18 and newer.
Contributor tooling uses ESLint 10 and is validated on Node.js 20.19+ and Node.js 22 in CI.

### 3. Create Branch

```bash
git checkout -b feature/your-feature-name
```

### 4. Make Changes

Make your changes, following our coding standards.

### 5. Test

```bash
npm run quality
npm audit
```

### 6. Submit PR

Push your changes and create a pull request.

## 📝 Coding Standards

### Code Style

- Use ESLint for JavaScript
- Follow Prettier formatting
- Write meaningful commit messages

### Commit Messages

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

### Testing

- Write unit tests for new features
- Ensure all tests and release checks pass
- Aim for >80% coverage

```bash
npm run quality
npm test
npm run test:coverage
npm audit
```

## 🛠️ Creating Skills

Review the public skill matrix first: [docs/skills-catalog.md](docs/skills-catalog.md).

### Skill Structure

```
skills/
└── your-skill/
    ├── SKILL.md        # Skill definition
    ├── index.js        # Implementation
    └── tests/          # Tests
```

## 🔌 Adding Providers or Adapters

Read [docs/provider-adapter-guide.md](docs/provider-adapter-guide.md) before adding provider code.

Provider PRs should include:

- A focused adapter contract
- Tests with fake responses
- Clear credential and dry-run behavior
- Secret redaction in user-facing output
- Documentation for required MCP or provider configuration

### Skill Definition (SKILL.md)

```markdown
---
name: your-skill
description: What this skill does
metadata:
  version: "1.0.0"
  author: your-name
  category: your-category
---

# Your Skill

## Trigger Conditions
When should this skill activate?

## Features
What does this skill do?

## Examples
How to use this skill?
```

### Skill Implementation (index.js)

```javascript
module.exports = {
  name: 'your-skill',
  version: '1.0.0',

  canHandle(input, context) {
    // Return true if this skill should handle the input
    return input.includes('your-trigger');
  },

  async execute(input, context) {
    // Implement skill logic
    return {
      success: true,
      data: { /* results */ }
    };
  }
};
```

## 📚 Documentation

### Writing Guidelines

- Use clear, concise language
- Include code examples
- Add diagrams where helpful
- Keep documentation up-to-date

### Documentation Structure

```
docs/
├── getting-started.md
├── configuration.md
├── skills.md
├── learning.md
├── architecture.md
└── api-reference.md
```

## 🧪 Testing Guidelines

### Unit Tests

```javascript
describe('YourFeature', () => {
  it('should do something', async () => {
    const input = {};
    const result = await yourFunction(input);
    expect(result).toBeDefined();
  });
});
```

### Integration Tests

```javascript
describe('Skill Integration', () => {
  it('should work with learning system', async () => {
    // Test skill + learning integration
  });
});
```

## 🚀 Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create release branch
4. Run `npm run quality`
5. Run `npm audit`
6. Create GitHub release
7. Publish to npm with provenance

## 📋 PR Checklist

Before submitting:

- [ ] Code follows style guidelines
- [ ] Tests are written and passing
- [ ] Documentation is updated
- [ ] Commit messages are clear
- [ ] No breaking changes (or documented)

## 🏷️ Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Documentation improvements
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention needed

## 📞 Getting Help

- **GitHub Discussions**: Questions and discussions
- **GitHub Issues**: Bug reports and features
- **Discord**: Community chat

## 🎉 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Invited to maintainer team (significant contributions)

## 📄 License

By contributing, you agree your contributions will be licensed under MIT License.

---

Thank you for contributing to FlowMind! 🚀
